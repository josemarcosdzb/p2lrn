import {
  BadRequestException, CanActivate, Controller, ExecutionContext, ForbiddenException,
  Headers, Injectable, PayloadTooLargeException, Post, Req, Res,
  UnauthorizedException, UseGuards,
} from '@nestjs/common';
import {
  saveP2LRNStudioPackage,readP2LRNStudioDocument,convertP2LRNStudioExternalPackage,
} from '@p2lrn/studio/server';

const COURSE_PATH='__COURSE_PATH__';
const MAX_COURSE_BYTES=512*1024*1024;
const MAX_READER_BYTES=128*1024*1024;

// Only the Host middleware may set these fields on the server-side request,
// after verifying the session, per-course permission and anti-CSRF token.
// Incoming headers must NEVER be copied to these fields.
@Injectable()
export class P2LRNStudioHostGuard implements CanActivate {
  canActivate(context:ExecutionContext):boolean{
    const req=context.switchToHttp().getRequest();
    const name=context.getHandler().name;
    const operation=name==='importPackage'?'import':name;
    if(!req.user)throw new UnauthorizedException('AUTHENTICATION_REQUIRED');
    if(!['save','read','import'].includes(operation) ||
       req.p2lrnStudioAuthorizedOperation!==operation ||
       req.p2lrnStudioAuthorizedCourse!==COURSE_PATH ||
       req.p2lrnStudioCsrfVerified!==true)
      throw new ForbiddenException('COURSE_ACCESS_DENIED');
    return true;
  }
}
async function raw(req:any,limit:number):Promise<Buffer>{
  const len=req.headers?.['content-length'];
  if(len!==undefined&&(!/^\d+$/.test(String(len))||Number(len)>limit))
    throw new PayloadTooLargeException('UPLOAD_TOO_LARGE');
  if(req.rawBody){
    const bytes=Buffer.from(req.rawBody);
    if(bytes.length>limit)throw new PayloadTooLargeException('UPLOAD_TOO_LARGE');
    return bytes;
  }
  const chunks:Buffer[]=[];let count=0;
  for await(const item of req){
    const chunk=Buffer.from(item);count+=chunk.length;
    if(count>limit)throw new PayloadTooLargeException('UPLOAD_TOO_LARGE');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks,count);
}
function filename(value:string|undefined,fallback:string,suffix?:string):string{
  const name=value||fallback;
  if(typeof name!=='string'||name.length>180||
     !/^[A-Za-z0-9][A-Za-z0-9._-]{0,160}$/.test(name)||
     /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])\./i.test(name)||
     /\.(?:php\d*|phtml|phar|cgi|asp|aspx|jsp|shtml)\./i.test(name)||
     (suffix&&!name.toLowerCase().endsWith(suffix)))
    throw new BadRequestException('INVALID_FILENAME');
  return name;
}
@UseGuards(P2LRNStudioHostGuard)
@Controller('api/p2lrn/studio')
export class P2LRNStudioController {
  @Post('save')
  async save(@Req() req:any,@Res() res:any,@Headers('x-p2lrn-filename') value?:string){
    const name=filename(value,'course.p2lrn','.p2lrn');
    const bytes=await raw(req,MAX_COURSE_BYTES);
    return res.json(await saveP2LRNStudioPackage(bytes,{
      coursePath:COURSE_PATH,filename:name,
    }));
  }
  @Post('read')
  async read(@Req() req:any,@Res() res:any,@Headers('x-p2lrn-filename') value?:string,@Headers('content-type') mediaType?:string){
    const name=filename(value,'document.bin');
    return res.json(await readP2LRNStudioDocument(await raw(req,MAX_READER_BYTES),{filename:name,mediaType}));
  }
  @Post('import')
  async importPackage(@Req() req:any,@Res() res:any,@Headers('x-p2lrn-filename') value?:string){
    const name=filename(value,'package.zip');
    const result=await convertP2LRNStudioExternalPackage(await raw(req,MAX_COURSE_BYTES),{filename:name});
    res.type('application/vnd.p2lrn+zip');
    return res.send(Buffer.from(result.bytes));
  }
}
