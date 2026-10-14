require 'open3'
require 'uri'
class P2lrnStudioController < ApplicationController
  def save
    dir=Rails.root.join('__COURSE_PATH__'); FileUtils.mkdir_p(dir)
    name=File.basename(request.headers['X-P2LRN-Filename'] || 'course.p2lrn')
    File.binwrite(dir.join(name),request.raw_post)
    render json:{ok:true,filename:name}
  end
  def read
    out,error=bridge('read','document.bin')
    return render json:{ok:false,error:error},status:422 if error
    render plain:out,content_type:'application/json'
  end
  def import_package
    out,error=bridge('import','package.zip')
    return render json:{ok:false,error:error},status:422 if error
    send_data out,type:'application/vnd.p2lrn+zip',disposition:'inline'
  end
  private
  def bridge(action,fallback)
    raw=request.headers['X-P2LRN-Filename'] || fallback
    name=URI.decode_www_form_component(raw)
    media=request.content_type || 'application/octet-stream'
    script=Rails.root.join('p2lrn-setup','p2lrn-studio-bridge.mjs').to_s
    out,err,status=Open3.capture3('node',script,action,name,media,stdin_data:request.raw_post,binmode:true)
    [out,status.success? ? nil : (err.strip.empty? ? 'P2LRN Studio bridge failed' : err.strip)]
  end
end
