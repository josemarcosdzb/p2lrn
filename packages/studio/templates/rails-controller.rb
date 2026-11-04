require 'open3'
require 'fileutils'
require 'tempfile'
require 'timeout'

class P2lrnStudioController < ApplicationController
  MAX_COURSE_BYTES = 512 * 1024 * 1024
  MAX_READER_BYTES = 128 * 1024 * 1024
  COURSE_PATH = '__COURSE_PATH__'.freeze
  before_action :require_studio_host_access!

  # Host middleware must set these server-side env attributes only after
  # authentication, course-specific authorization and CSRF verification.
  # Generated endpoints reject all clients until explicitly integrated.
  def require_studio_host_access!
    operation = action_name == 'import_package' ? 'import' : action_name
    unless request.env['p2lrn.studio.principal']
      render json: {ok: false, error: 'AUTHENTICATION_REQUIRED'}, status: 401
      return
    end
    unless request.env['p2lrn.studio.operation'] == operation &&
           request.env['p2lrn.studio.course'] == COURSE_PATH &&
           request.env['p2lrn.studio.csrf_ok'] == true
      render json: {ok: false, error: 'COURSE_ACCESS_DENIED'}, status: 403
    end
  end

  def save
    name = safe_filename('course.p2lrn', '.p2lrn')
    bytes = bounded_body(MAX_COURSE_BYTES)
    root = Rails.root.realpath
    dir = Rails.root.join(COURSE_PATH)
    FileUtils.mkdir_p(dir, mode: 0700)
    actual = dir.realpath
    raise SecurityError, 'UNSAFE_STORAGE_PATH' unless actual.to_s == root.to_s || actual.to_s.start_with?(root.to_s + File::SEPARATOR)
    target = actual.join(name)
    raise SecurityError, 'UNSAFE_DESTINATION' if File.symlink?(target) || File.directory?(target)

    temporary = Tempfile.new(['.p2lrn-', '.tmp'], actual.to_s)
    begin
      temporary.binmode
      temporary.write(bytes)
      temporary.flush
      temporary.fsync
      temporary.close
      raise SecurityError, 'UNSAFE_DESTINATION' if File.symlink?(target)
      File.rename(temporary.path, target)
      render json: {ok: true, filename: name, bytes: bytes.bytesize}
    ensure
      temporary.close! rescue nil
    end
  rescue ArgumentError
    render json: {ok: false, error: 'INVALID_FILENAME'}, status: 400
  rescue RangeError
    render json: {ok: false, error: 'UPLOAD_TOO_LARGE'}, status: 413
  rescue SecurityError
    render json: {ok: false, error: 'UNSAFE_STORAGE_PATH'}, status: 403
  rescue StandardError
    render json: {ok: false, error: 'STORAGE_UNAVAILABLE'}, status: 507
  end

  def read
    out = bridge('read', 'document.bin', MAX_READER_BYTES)
    render plain: out, content_type: 'application/json'
  rescue ArgumentError
    render json: {ok: false, error: 'INVALID_FILENAME'}, status: 400
  rescue RangeError
    render json: {ok: false, error: 'UPLOAD_TOO_LARGE'}, status: 413
  rescue StandardError
    render json: {ok: false, error: 'READER_FAILED'}, status: 422
  end

  def import_package
    out = bridge('import', 'package.zip', MAX_COURSE_BYTES)
    send_data out, type: 'application/vnd.p2lrn+zip', disposition: 'inline'
  rescue ArgumentError
    render json: {ok: false, error: 'INVALID_FILENAME'}, status: 400
  rescue RangeError
    render json: {ok: false, error: 'UPLOAD_TOO_LARGE'}, status: 413
  rescue StandardError
    render json: {ok: false, error: 'IMPORT_FAILED'}, status: 422
  end

  private

  def safe_filename(fallback, suffix = nil)
    name = request.headers['X-P2LRN-Filename'] || fallback
    unless name.is_a?(String) && name.bytesize <= 180 &&
           name.match?(/\A[A-Za-z0-9][A-Za-z0-9._-]{0,160}\z/) &&
           !name.match?(/\A(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])\./i) &&
           !name.match?(/\.(?:php\d*|phtml|phar|cgi|asp|aspx|jsp|shtml)\./i) &&
           (suffix.nil? || name.downcase.end_with?(suffix))
      raise ArgumentError, 'INVALID_FILENAME'
    end
    name
  end

  def bounded_body(max)
    if request.content_length && (request.content_length < 0 || request.content_length > max)
      raise RangeError, 'UPLOAD_TOO_LARGE'
    end
    bytes = request.raw_post
    raise RangeError, 'UPLOAD_TOO_LARGE' if bytes.bytesize > max
    bytes
  end

  def bridge(action, fallback, max)
    name = safe_filename(fallback)
    bytes = bounded_body(max)
    script = Rails.root.join('p2lrn-setup', 'p2lrn-studio-bridge.mjs').to_s
    out, _stderr, status = Timeout.timeout(120) {
      Open3.capture3('node', script, action, name,
                     request.content_type || 'application/octet-stream',
                     stdin_data: bytes, binmode: true)
    }
    raise 'BRIDGE_FAILED' unless status.success? && out.bytesize <= max
    out
  end
end
