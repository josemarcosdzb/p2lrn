<?php
declare(strict_types=1);
// Chamilo 3-compatible IMS/LTI: Gradebook Category::load requires an integer
// course ID; the plugin still supplies legacy course-code strings.
$root='/var/www/chamilo/public/plugin/ImsLti/';
$replacements=[
 'configure.php'=>[
  'Category::load(null, null, $course->getCode())',
  'Category::load(null, null, $course->getId())',
 ],
 'gradebook/add_eval.php'=>[
  'Category::load(null, null, $course->getCode(), null, null, $sessionId)',
  'Category::load(null, null, $course->getId(), null, null, $sessionId)',
 ],
 'src/Service/Resource/LtiLineItemsResource.php'=>[
  'Category::load(null, null, $this->course->getCode())',
  'Category::load(null, null, $this->course->getId())',
 ],
 'src/Form/FrmAdd.php'=>[
  'Category::load(null, null, api_get_course_id())',
  'Category::load(null, null, api_get_course_int_id())',
 ],
 'src/Form/FrmEdit.php'=>[
  'Category::load(null, null, api_get_course_id())',
  'Category::load(null, null, api_get_course_int_id())',
 ],
];
// Validate the entire batch before modifying any source.
$pending=[];
foreach($replacements as $relative=>[$before,$after]){
 $file=$root.$relative;$content=file_get_contents($file);
 if(!is_string($content))throw new RuntimeException('Missing '.$relative);
 if(substr_count($content,$after)===1)continue;
 if(substr_count($content,$before)!==1)throw new RuntimeException('Unsupported version '.$relative);
 $pending[$file]=str_replace($before,$after,$content);
}
foreach($pending as $file=>$content){
 if(file_put_contents($file,$content)===false)throw new RuntimeException('Cannot update '.$file);
}
echo "IMS_LTI_GRADEBOOK_IDS_PATCHED=".count($pending)."\n";