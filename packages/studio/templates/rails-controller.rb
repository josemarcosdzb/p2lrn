class P2lrnStudioController < ApplicationController
  def save
    dir=Rails.root.join('__COURSE_PATH__'); FileUtils.mkdir_p(dir)
    name=File.basename(request.headers['X-P2LRN-Filename'] || 'course.p2lrn')
    File.binwrite(dir.join(name),request.raw_post)
    render json:{ok:true,filename:name}
  end
end
