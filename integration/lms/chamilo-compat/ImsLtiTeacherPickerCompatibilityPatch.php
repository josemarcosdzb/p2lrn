<?php
declare(strict_types=1);
// Expose administrator-installed LTI 1.3 Deep Linking tools to teachers.
// Never expose technical client credentials in the course-publishing flow.
// configure.php already requires teacher permission for the current course.
$root='/var/www/chamilo/public/plugin/ImsLti/';
$config=$root.'configure.php';
$template=$root.'view/add.tpl';
$source=file_get_contents($config);
$view=file_get_contents($template);
if(!is_string($source)||!is_string($view))throw new RuntimeException('Chamilo UI files missing');
$old='$template->assign('."'global_tools'".', $globalTools);';
$block=<<<'PHP'
$deepLinkChoices = [];
foreach ($globalTools as $globalTool) {
    if (ImsLti::V_1P3 !== $globalTool->getVersion()
        || !$globalTool->isActiveDeepLinking()
        || null !== $globalTool->getParent()) {
        continue;
    }
    $deepLinkChoices[] = [
        'title' => $globalTool->getTitle(),
        'href' => api_get_path(WEB_PLUGIN_PATH).'ImsLti/start.php?'.http_build_query([
            'id' => $globalTool->getId(),
            'cid' => $course->getId(),
        ]),
    ];
}
$template->assign('deep_link_choices', $deepLinkChoices);
PHP;
if(substr_count($source,'$template->assign('."'deep_link_choices'")===0){
 if(substr_count($source,$old)!==1)throw new RuntimeException('Chamilo course template assignment shape unsupported');
 $source=str_replace($old,$old."\n".$block,$source);
}elseif(substr_count($source,'$template->assign('."'deep_link_choices'")!==1){
 throw new RuntimeException('Duplicate course deep link assignment');
}
$before='<div class="p-6 lg:p-8">'."\n".'                <div id="ims-lti-create-form"';
$after=<<<'TWIG'
<div class="p-6 lg:p-8">
                {% if deep_link_choices is defined and deep_link_choices|length > 0 %}
                <section id="p2lrn-chamilo-course-picker" aria-labelledby="p2lrn-publisher-title" class="mb-6 rounded-xl border border-gray-25 bg-support-2 p-5">
                    <h2 id="p2lrn-publisher-title" class="text-xl font-semibold">Publicar contenido en este curso</h2>
                    <p class="mt-2 text-body-2">Selecciona la herramienta instalada por el centro. Después puedes subir un archivo .p2lrn o elegir un curso existente, sin introducir claves técnicas.</p>
                    <div class="mt-4 flex flex-wrap gap-3">
                    {% for item in deep_link_choices %}
                        <a class="inline-flex rounded-xl bg-primary px-5 py-3 font-semibold text-white" href="{{ item.href|e('html_attr') }}">Añadir contenido con {{ item.title|e }}</a>
                    {% endfor %}
                    </div>
                </section>
                <details class="rounded-lg border border-gray-25 p-4"><summary class="cursor-pointer font-semibold">Configuración avanzada de otra herramienta</summary>
                {% endif %}
                <div id="ims-lti-create-form"
TWIG;
if(substr_count($view,'id="p2lrn-chamilo-course-picker"')===0){
 if(substr_count($view,$before)!==1)throw new RuntimeException('Teacher view insertion anchor unsupported');
 $view=str_replace($before,$after,$view);
 $oldClose=<<<'TWIG'
                </div>
            </div>
        </div>
TWIG;
 $newClose=<<<'TWIG'
                </div>
                {% if deep_link_choices is defined and deep_link_choices|length > 0 %}
                </details>
                {% endif %}
            </div>
        </div>
TWIG;
 if(substr_count($view,$oldClose)!==1)throw new RuntimeException('Teacher view closing anchor unsupported');
 $view=str_replace($oldClose,$newClose,$view);
}elseif(substr_count($view,'id="p2lrn-chamilo-course-picker"')!==1){
 throw new RuntimeException('Duplicate native picker section');
}
if(file_put_contents($config,$source)===false || file_put_contents($template,$view)===false){
 throw new RuntimeException('Could not update native Chamilo teacher picker');
}
echo "IMS_LTI_NATIVE_TEACHER_PICKER_ENABLED\n";