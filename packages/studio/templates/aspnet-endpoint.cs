using System.Diagnostics;
public static class P2LRNStudioEndpoint {
  private static async Task<(int Code,byte[] Out,string Error)> Bridge(HttpRequest req,string action,string fallback) {
    var raw=req.Headers["X-P2LRN-Filename"].FirstOrDefault() ?? fallback;
    var name=Uri.UnescapeDataString(raw);
    var media=req.ContentType ?? "application/octet-stream";
    var bridge=Path.Combine(Directory.GetCurrentDirectory(),"p2lrn-setup","p2lrn-studio-bridge.mjs");
    var start=new ProcessStartInfo("node"){RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true,UseShellExecute=false};
    start.ArgumentList.Add(bridge); start.ArgumentList.Add(action); start.ArgumentList.Add(name); start.ArgumentList.Add(media);
    using var process=Process.Start(start) ?? throw new InvalidOperationException("Unable to start P2LRN Studio bridge");
    await req.Body.CopyToAsync(process.StandardInput.BaseStream); process.StandardInput.Close();
    using var output=new MemoryStream(); await process.StandardOutput.BaseStream.CopyToAsync(output);
    var error=await process.StandardError.ReadToEndAsync(); await process.WaitForExitAsync();
    return (process.ExitCode,output.ToArray(),error);
  }
  public static void MapP2LRNStudio(this WebApplication app) {
    app.MapPost("__ENDPOINT__", async (HttpRequest req) => {
      var dir=Path.Combine(Directory.GetCurrentDirectory(),"__COURSE_PATH__"); Directory.CreateDirectory(dir);
      var raw=req.Headers["X-P2LRN-Filename"].FirstOrDefault() ?? "course.p2lrn";
      var name=Path.GetFileName(raw); var file=Path.Combine(dir,name);
      await using var output=File.Create(file); await req.Body.CopyToAsync(output);
      return Results.Json(new {ok=true,filename=name});
    });
    app.MapPost("__READER_ENDPOINT__", async (HttpRequest req) => {
      var result=await Bridge(req,"read","document.bin");
      return result.Code==0 ? Results.Bytes(result.Out,"application/json") : Results.Json(new {ok=false,error=result.Error},statusCode:422);
    });
    app.MapPost("__IMPORT_ENDPOINT__", async (HttpRequest req) => {
      var result=await Bridge(req,"import","package.zip");
      return result.Code==0 ? Results.Bytes(result.Out,"application/vnd.p2lrn+zip") : Results.Json(new {ok=false,error=result.Error},statusCode:422);
    });
  }
}
