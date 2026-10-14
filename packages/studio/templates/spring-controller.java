import java.io.*;
import java.nio.file.*;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
@RestController
public class P2LRNStudioController {
 private byte[] bridge(String action,byte[] body,String filename,String mediaType) throws Exception {
  String name=URLDecoder.decode(filename,StandardCharsets.UTF_8);
  Process process=new ProcessBuilder("node","p2lrn-setup/p2lrn-studio-bridge.mjs",action,name,mediaType).start();
  try(OutputStream stdin=process.getOutputStream()){stdin.write(body);}
  byte[] out=process.getInputStream().readAllBytes();
  String error=new String(process.getErrorStream().readAllBytes(),StandardCharsets.UTF_8);
  int code=process.waitFor();
  if(code!=0)throw new IllegalStateException(error.isBlank()?"P2LRN Studio bridge failed":error.trim());
  return out;
 }
 @PostMapping(value="__ENDPOINT__",consumes="application/vnd.p2lrn+zip")
 public ResponseEntity<?> save(@RequestBody byte[] body,@RequestHeader(value="X-P2LRN-Filename",defaultValue="course.p2lrn") String filename) throws Exception {
  Path dir=Paths.get("__COURSE_PATH__").toAbsolutePath().normalize(); Files.createDirectories(dir);
  Path file=dir.resolve(Paths.get(filename).getFileName()).normalize();
  if(!file.startsWith(dir))return ResponseEntity.badRequest().body("Invalid filename");
  Files.write(file,body); return ResponseEntity.ok(java.util.Map.of("ok",true,"filename",file.getFileName().toString()));
 }
 @PostMapping(value="__READER_ENDPOINT__")
 public ResponseEntity<?> read(@RequestBody byte[] body,@RequestHeader(value="X-P2LRN-Filename",defaultValue="document.bin") String filename,@RequestHeader(value="Content-Type",defaultValue="application/octet-stream") String mediaType) {
  try{return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(bridge("read",body,filename,mediaType));}
  catch(Exception error){return ResponseEntity.unprocessableEntity().body(java.util.Map.of("ok",false,"error",error.getMessage()));}
 }
 @PostMapping(value="__IMPORT_ENDPOINT__")
 public ResponseEntity<?> importPackage(@RequestBody byte[] body,@RequestHeader(value="X-P2LRN-Filename",defaultValue="package.zip") String filename,@RequestHeader(value="Content-Type",defaultValue="application/zip") String mediaType) {
  try{return ResponseEntity.ok().contentType(MediaType.parseMediaType("application/vnd.p2lrn+zip")).body(bridge("import",body,filename,mediaType));}
  catch(Exception error){return ResponseEntity.unprocessableEntity().body(java.util.Map.of("ok",false,"error",error.getMessage()));}
 }
}
