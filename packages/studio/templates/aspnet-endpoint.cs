public static class P2LRNStudioEndpoint {
  public static void MapP2LRNStudio(this WebApplication app) {
    app.MapPost("__ENDPOINT__", async (HttpRequest req) => {
      var dir=Path.Combine(Directory.GetCurrentDirectory(),"__COURSE_PATH__"); Directory.CreateDirectory(dir);
      var raw=req.Headers["X-P2LRN-Filename"].FirstOrDefault() ?? "course.p2lrn";
      var name=Path.GetFileName(raw); var file=Path.Combine(dir,name);
      await using var output=File.Create(file); await req.Body.CopyToAsync(output);
      return Results.Json(new {ok=true,filename=name});
    });
  }
}
