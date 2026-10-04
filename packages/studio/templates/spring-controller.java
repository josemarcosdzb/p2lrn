import java.nio.file.*;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
@RestController
public class P2LRNStudioController {
 @PostMapping(value="__ENDPOINT__",consumes="application/vnd.p2lrn+zip")
 public ResponseEntity<?> save(@RequestBody byte[] body,@RequestHeader(value="X-P2LRN-Filename",defaultValue="course.p2lrn") String filename) throws Exception {
  Path dir=Paths.get("__COURSE_PATH__").toAbsolutePath().normalize(); Files.createDirectories(dir);
  Path file=dir.resolve(Paths.get(filename).getFileName()).normalize();
  if(!file.startsWith(dir))return ResponseEntity.badRequest().body("Invalid filename");
  Files.write(file,body); return ResponseEntity.ok(java.util.Map.of("ok",true,"filename",file.getFileName().toString()));
 }
}
