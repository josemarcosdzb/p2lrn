import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
public class P2LRNStudioController {
  private static final long MAX_COURSE=512L*1024*1024;
  private static final long MAX_READER=128L*1024*1024;
  private static final String COURSE_PATH="__COURSE_PATH__";
  private static final Pattern NAME=Pattern.compile("^[A-Za-z0-9][A-Za-z0-9._-]{0,160}$");
  private static final Pattern EXEC=Pattern.compile("\\.(?:php[0-9]*|phtml|phar|cgi|asp|aspx|jsp|shtml)\\.",Pattern.CASE_INSENSITIVE);
  private static final Pattern RESERVED=Pattern.compile("^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])\\.",Pattern.CASE_INSENSITIVE);

  // Host security middleware must set these *server-side attributes*, after
  // verifying an authenticated user, permissions for this course and operation,
  // and a valid anti-CSRF token. Unconfigured endpoints always deny access.
  private ResponseEntity<?> guard(HttpServletRequest req,String operation) {
    if(req.getUserPrincipal()==null)
      return ResponseEntity.status(401).body(Map.of("ok",false,"error","AUTHENTICATION_REQUIRED"));
    if(!operation.equals(req.getAttribute("p2lrn.studio.operation")) ||
       !COURSE_PATH.equals(req.getAttribute("p2lrn.studio.course")) ||
       !Boolean.TRUE.equals(req.getAttribute("p2lrn.studio.csrf_ok")))
      return ResponseEntity.status(403).body(Map.of("ok",false,"error","COURSE_ACCESS_DENIED"));
    return null;
  }
  private static String filename(HttpServletRequest req,String fallback,String suffix) {
    String raw=req.getHeader("X-P2LRN-Filename");
    String name=raw==null?fallback:raw;
    if(name.length()>180 || !NAME.matcher(name).matches() ||
       EXEC.matcher(name).find() || RESERVED.matcher(name).find() ||
       (suffix!=null && !name.toLowerCase(java.util.Locale.ROOT).endsWith(suffix)))
      throw new IllegalArgumentException("INVALID_FILENAME");
    return name;
  }
  private static byte[] bounded(InputStream input,long limit) throws Exception {
    ByteArrayOutputStream out=new ByteArrayOutputStream();
    byte[] chunk=new byte[65536];
    int read;
    while((read=input.read(chunk))!=-1) {
      if((long)out.size()+read>limit)throw new IllegalStateException("UPLOAD_TOO_LARGE");
      out.write(chunk,0,read);
    }
    return out.toByteArray();
  }
  private static byte[] body(HttpServletRequest req,long limit) throws Exception {
    if(req.getContentLengthLong()>limit)throw new IllegalStateException("UPLOAD_TOO_LARGE");
    return bounded(req.getInputStream(),limit);
  }
  private static byte[] bridge(HttpServletRequest req,String action,String fallback,long limit) throws Exception {
    String name=filename(req,fallback,null);
    byte[] input=body(req,limit);
    Process proc=new ProcessBuilder("node","p2lrn-setup/p2lrn-studio-bridge.mjs",action,name,
      req.getContentType()==null?"application/octet-stream":req.getContentType()).start();
    try {
      try(OutputStream stdin=proc.getOutputStream()){stdin.write(input);}
      byte[] result=bounded(proc.getInputStream(),limit);
      byte[] stderr=bounded(proc.getErrorStream(),4096);
      if(!proc.waitFor(120,TimeUnit.SECONDS) || proc.exitValue()!=0)
        throw new IllegalStateException("BRIDGE_FAILED");
      return result;
    } finally {proc.destroyForcibly();}
  }
  private static ResponseEntity<?> failed(Exception e,String phase) {
    if(e instanceof IllegalArgumentException)
      return ResponseEntity.status(400).body(Map.of("ok",false,"error","INVALID_FILENAME"));
    if("UPLOAD_TOO_LARGE".equals(e.getMessage()))
      return ResponseEntity.status(413).body(Map.of("ok",false,"error","UPLOAD_TOO_LARGE"));
    return ResponseEntity.status(phase.equals("STORAGE_UNAVAILABLE")?507:422)
      .body(Map.of("ok",false,"error",phase));
  }

  @PostMapping(value="__ENDPOINT__")
  public ResponseEntity<?> save(HttpServletRequest req) {
    ResponseEntity<?> denied=guard(req,"save");if(denied!=null)return denied;
    Path temporary=null;
    try {
      String name=filename(req,"course.p2lrn",".p2lrn");
      byte[] data=body(req,MAX_COURSE);
      Path root=Paths.get("").toAbsolutePath().toRealPath();
      Path dir=root.resolve(COURSE_PATH).normalize();
      if(!dir.startsWith(root))return ResponseEntity.status(403).body(Map.of("ok",false,"error","UNSAFE_STORAGE_PATH"));
      Files.createDirectories(dir);
      dir=dir.toRealPath();
      if(!dir.startsWith(root))return ResponseEntity.status(403).body(Map.of("ok",false,"error","UNSAFE_STORAGE_PATH"));
      Path target=dir.resolve(name);
      if(Files.isSymbolicLink(target)||Files.isDirectory(target))
        return ResponseEntity.status(403).body(Map.of("ok",false,"error","UNSAFE_DESTINATION"));
      temporary=Files.createTempFile(dir,".p2lrn-",".tmp");
      Files.write(temporary,data,StandardOpenOption.TRUNCATE_EXISTING);
      if(Files.isSymbolicLink(target))
        return ResponseEntity.status(403).body(Map.of("ok",false,"error","UNSAFE_DESTINATION"));
      Files.move(temporary,target,StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING);
      temporary=null;
      return ResponseEntity.ok(Map.of("ok",true,"filename",name,"bytes",data.length));
    }catch(Exception e){return failed(e,"STORAGE_UNAVAILABLE");}
    finally{if(temporary!=null)try{Files.deleteIfExists(temporary);}catch(Exception ignored){}}
  }
  @PostMapping(value="__READER_ENDPOINT__")
  public ResponseEntity<?> read(HttpServletRequest req) {
    ResponseEntity<?> denied=guard(req,"read");if(denied!=null)return denied;
    try{return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(bridge(req,"read","document.bin",MAX_READER));}
    catch(Exception e){return failed(e,"READER_FAILED");}
  }
  @PostMapping(value="__IMPORT_ENDPOINT__")
  public ResponseEntity<?> importPackage(HttpServletRequest req) {
    ResponseEntity<?> denied=guard(req,"import");if(denied!=null)return denied;
    try{return ResponseEntity.ok().contentType(MediaType.parseMediaType("application/vnd.p2lrn+zip"))
      .body(bridge(req,"import","package.zip",MAX_COURSE));}
    catch(Exception e){return failed(e,"IMPORT_FAILED");}
  }
}
