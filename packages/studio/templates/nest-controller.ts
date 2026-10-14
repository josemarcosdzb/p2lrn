import {Controller,Headers,Post,Req,Res} from '@nestjs/common';
import {saveP2LRNStudioPackage,readP2LRNStudioDocument,convertP2LRNStudioExternalPackage} from '@p2lrn/studio/server';

async function raw(req:any){if(req.rawBody)return Buffer.from(req.rawBody);const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));return Buffer.concat(chunks)}
function filename(value:string|undefined,fallback:string){const raw=value||fallback;try{return decodeURIComponent(raw)}catch{return raw}}

@Controller('api/p2lrn/studio')
export class P2LRNStudioController {
  @Post('save') async save(@Req() req:any,@Res() res:any,@Headers('x-p2lrn-filename') value?:string){return res.json(await saveP2LRNStudioPackage(await raw(req),{coursePath:'__COURSE_PATH__',filename:filename(value,'course.p2lrn')}))}
  @Post('read') async read(@Req() req:any,@Res() res:any,@Headers('x-p2lrn-filename') value?:string,@Headers('content-type') mediaType?:string){return res.json(await readP2LRNStudioDocument(await raw(req),{filename:filename(value,'document.bin'),mediaType}))}
  @Post('import') async importPackage(@Req() req:any,@Res() res:any,@Headers('x-p2lrn-filename') value?:string){const result=await convertP2LRNStudioExternalPackage(await raw(req),{filename:filename(value,'package.zip')});res.type('application/vnd.p2lrn+zip');return res.send(Buffer.from(result.bytes))}
}
