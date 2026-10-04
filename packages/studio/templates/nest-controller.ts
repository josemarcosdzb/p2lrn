import {Controller,Headers,Post,Req,Res} from '@nestjs/common';
import {saveP2LRNStudioPackage} from '@p2lrn/studio/server';

@Controller('api/p2lrn/studio')
export class P2LRNStudioController {
  @Post('save')
  async save(@Req() req:any,@Res() res:any,@Headers('x-p2lrn-filename') filename?:string){
    const chunks:Buffer[]=[];
    for await(const chunk of req)chunks.push(Buffer.from(chunk));
    const result=await saveP2LRNStudioPackage(Buffer.concat(chunks),{coursePath:'__COURSE_PATH__',filename:filename||'course.p2lrn'});
    return res.json(result);
  }
}
