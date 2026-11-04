using System;
using System.Diagnostics;
using System.IO;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;

public static class P2LRNStudioEndpoint {
  private const long MaxCourse = 512L * 1024 * 1024;
  private const long MaxReader = 128L * 1024 * 1024;
  private const string CoursePath = "__COURSE_PATH__";

  // Host middleware must set these HttpContext.Items after real session,
  // per-course authorization and CSRF checks. Request headers cannot set them.
  private static IResult? Guard(HttpRequest req, string operation) {
    if (req.HttpContext.User.Identity?.IsAuthenticated != true)
      return Results.Json(new {ok=false,error="AUTHENTICATION_REQUIRED"},statusCode:401);
    var items = req.HttpContext.Items;
    if (!string.Equals(items["p2lrn.studio.operation"] as string,operation,StringComparison.Ordinal) ||
        !string.Equals(items["p2lrn.studio.course"] as string,CoursePath,StringComparison.Ordinal) ||
        !object.Equals(items["p2lrn.studio.csrf_ok"],true))
      return Results.Json(new {ok=false,error="COURSE_ACCESS_DENIED"},statusCode:403);
    return null;
  }

  private static string Filename(HttpRequest req,string fallback,string? suffix=null) {
    var header=req.Headers["X-P2LRN-Filename"].ToString();
    var name=string.IsNullOrEmpty(header)?fallback:header;
    if (name.Length>180 ||
        !Regex.IsMatch(name,@"\A[A-Za-z0-9][A-Za-z0-9._-]{0,160}\z") ||
        Regex.IsMatch(name,@"\A(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])\.",RegexOptions.IgnoreCase) ||
        Regex.IsMatch(name,@"\.(?:php[0-9]*|phtml|phar|cgi|asp|aspx|jsp|shtml)\.",RegexOptions.IgnoreCase) ||
        (suffix!=null&&!name.EndsWith(suffix,StringComparison.OrdinalIgnoreCase)))
      throw new ArgumentException("INVALID_FILENAME");
    return name;
  }

  private static async Task<byte[]> ReadBounded(Stream stream,long limit) {
    using var output=new MemoryStream();
    var buffer=new byte[64*1024];
    int length;
    while((length=await stream.ReadAsync(buffer))>0) {
      if(output.Length+length>limit)throw new InvalidDataException("UPLOAD_TOO_LARGE");
      output.Write(buffer,0,length);
    }
    return output.ToArray();
  }
  private static async Task<byte[]> Body(HttpRequest req,long limit) {
    if(req.ContentLength>limit)throw new InvalidDataException("UPLOAD_TOO_LARGE");
    return await ReadBounded(req.Body,limit);
  }

  private static async Task<byte[]> Bridge(HttpRequest req,string action,string fallback,long limit) {
    var name=Filename(req,fallback);
    var bytes=await Body(req,limit);
    var script=Path.Combine(Directory.GetCurrentDirectory(),"p2lrn-setup","p2lrn-studio-bridge.mjs");
    var start=new ProcessStartInfo("node") {
      RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true,UseShellExecute=false
    };
    foreach(var arg in new[]{script,action,name,req.ContentType??"application/octet-stream"})
      start.ArgumentList.Add(arg);
    using var process=Process.Start(start) ?? throw new InvalidOperationException("BRIDGE_UNAVAILABLE");
    using var timeout=new CancellationTokenSource(TimeSpan.FromSeconds(120));
    try {
      await process.StandardInput.BaseStream.WriteAsync(bytes,timeout.Token);
      process.StandardInput.Close();
      var stdout=ReadBounded(process.StandardOutput.BaseStream,limit);
      var stderr=process.StandardError.ReadToEndAsync();
      var output=await stdout;
      await process.WaitForExitAsync(timeout.Token);
      await stderr;
      if(process.ExitCode!=0)throw new InvalidOperationException("BRIDGE_FAILED");
      return output;
    } catch {
      if(!process.HasExited)process.Kill(entireProcessTree:true);
      throw;
    }
  }

  private static IResult Error(Exception error,string phase) =>
    error is ArgumentException ? Results.Json(new {ok=false,error="INVALID_FILENAME"},statusCode:400) :
    error is InvalidDataException ? Results.Json(new {ok=false,error="UPLOAD_TOO_LARGE"},statusCode:413) :
    Results.Json(new {ok=false,error=phase},statusCode:422);

  public static void MapP2LRNStudio(this WebApplication app) {
    app.MapPost("__ENDPOINT__",async (HttpRequest req) => {
      var denied=Guard(req,"save");if(denied!=null)return denied;
      try {
        var name=Filename(req,"course.p2lrn",".p2lrn");
        var bytes=await Body(req,MaxCourse);
        var root=Path.GetFullPath(Directory.GetCurrentDirectory());
        var dir=Path.GetFullPath(Path.Combine(root,CoursePath));
        if(!dir.StartsWith(root+Path.DirectorySeparatorChar,StringComparison.Ordinal) && dir!=root)
          return Results.Json(new {ok=false,error="UNSAFE_STORAGE_PATH"},statusCode:403);
        Directory.CreateDirectory(dir);
        if((File.GetAttributes(dir)&FileAttributes.ReparsePoint)!=0)
          return Results.Json(new {ok=false,error="UNSAFE_STORAGE_PATH"},statusCode:403);
        var target=Path.Combine(dir,name);
        if(Directory.Exists(target) ||
           (File.Exists(target)&&(File.GetAttributes(target)&FileAttributes.ReparsePoint)!=0))
          return Results.Json(new {ok=false,error="UNSAFE_DESTINATION"},statusCode:403);
        var temporary=Path.Combine(dir,".p2lrn-"+Guid.NewGuid().ToString("N")+".tmp");
        try {
          await using(var stream=new FileStream(temporary,FileMode.CreateNew,FileAccess.Write,FileShare.None))
          { await stream.WriteAsync(bytes);await stream.FlushAsync(); }
          if(File.Exists(target)&&(File.GetAttributes(target)&FileAttributes.ReparsePoint)!=0)
            return Results.Json(new {ok=false,error="UNSAFE_DESTINATION"},statusCode:403);
          File.Move(temporary,target,overwrite:true);
        } finally {if(File.Exists(temporary))File.Delete(temporary);}
        return Results.Json(new {ok=true,filename=name,bytes=bytes.LongLength});
      } catch(Exception error) {
        var response=Error(error,"STORAGE_UNAVAILABLE");
        return response;
      }
    });
    app.MapPost("__READER_ENDPOINT__",async (HttpRequest req) => {
      var denied=Guard(req,"read");if(denied!=null)return denied;
      try{return Results.Bytes(await Bridge(req,"read","document.bin",MaxReader),"application/json");}
      catch(Exception error){return Error(error,"READER_FAILED");}
    });
    app.MapPost("__IMPORT_ENDPOINT__",async (HttpRequest req) => {
      var denied=Guard(req,"import");if(denied!=null)return denied;
      try{return Results.Bytes(await Bridge(req,"import","package.zip",MaxCourse),"application/vnd.p2lrn+zip");}
      catch(Exception error){return Error(error,"IMPORT_FAILED");}
    });
  }
}
