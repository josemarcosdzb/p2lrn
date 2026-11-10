<?php
declare(strict_types=1);

/**
 * Chamilo IMS/LTI 1.9.0 compatibility with Chamilo 2/3 entities and
 * firebase/php-jwt 6.x. This touches source code only, never course DB rows.
 * The LTI JWT must be verified before any course resource is created.
 */
$root='/var/www/chamilo/public/plugin/ImsLti/';
$parts=[];
function substituteOnce(string $filename,string $old,string $new): void {
    global $parts;
    $current=$parts[$filename]??file_get_contents($filename);
    if(!is_string($current))throw new RuntimeException('Missing Chamilo source');
    if(substr_count($current,$new)===1){$parts[$filename]=$current;return;}
    if(substr_count($current,$old)!==1)throw new RuntimeException('Unsupported source layout '.basename($filename));
    $parts[$filename]=str_replace($old,$new,$current);
}
$auth=$root.'auth.php';
substituteOnce($auth,
  "'deep_link_return_url' => ".'$webPluginPath'.".'ImsLti/item_return2.php',",
  "'deep_link_return_url' => ".'$webPluginPath'.".'ImsLti/item_return2.php?cid='.".'$course->getId()'.","
);
$return=$root.'item_return2.php';
substituteOnce($return,
  'use Firebase\JWT\JWT;',
  "use Firebase\\JWT\\JWT;\nuse Firebase\\JWT\\Key;"
);
substituteOnce($return,
  "api_protect_course_script();\napi_block_anonymous_users(false);",
  "api_protect_course_script();\napi_protect_teacher_script();\napi_block_anonymous_users(false);"
);
substituteOnce($return,
  '$jwt = empty($_REQUEST['."'JWT'".']) ? '."''".' : $_REQUEST['."'JWT'".'];',
  '$jwt = ($_SERVER['."'REQUEST_METHOD'".'] ?? '."''".') === '."'POST'".' ? (string) ($_POST['."'JWT'".'] ?? '."''".') : '."''".';'
);
substituteOnce($return,
  "    if (empty(\$jwt)) {\n        throw new Exception('Token is missing');\n    }",
  "    if (empty(\$jwt) || strlen(\$jwt) > 131072) {\n        throw new Exception('Invalid deep-linking response');\n    }"
);
substituteOnce($return,
  '    $decodedJwt = JWT::decode($jwt, $ltiTool->publicKey, ['."'RS256'".']);',
  "    \$verifiedKey = ImsLtiPlugin::create()->getToolPublicKey(\$ltiTool);\n".
  "    if (empty(\$verifiedKey)) {\n        throw new Exception('LTI signature key unavailable');\n    }\n".
  "    \$decodedJwt = JWT::decode(\$jwt, new Key(\$verifiedKey, 'RS256'));\n".
  "    if ((\$decodedJwt->{'https://purl.imsglobal.org/spec/lti/claim/message_type'} ?? '') !== 'LtiDeepLinkingResponse'\n".
  "        || (\$decodedJwt->{'https://purl.imsglobal.org/spec/lti/claim/deployment_id'} ?? '') !== (string) \$ltiTool->getId()\n".
  "        || (\$decodedJwt->{'https://purl.imsglobal.org/spec/lti-dl/claim/data'} ?? '') !== 'tool:'.\$ltiTool->getId()) {\n".
  "        throw new Exception('Invalid signed deep-linking claims');\n    }"
);
substituteOnce($return,
  "        \$contentItem->save(\$ltiTool, \$course);",
  "        if (null === \$contentItem) {\n            throw new Exception('Unsupported deep-link content type');\n        }\n".
  "        \$contentItem->save(\$ltiTool, \$course);"
);
substituteOnce($return,
  '} catch (Exception $exception) {',
  '} catch (Throwable $exception) {'
);
$resource=$root.'src/ContentItem/LtiResourceLink.php';
substituteOnce($resource,
  'use Chamilo\LtiBundle\Entity\ExternalTool;',
  "use Chamilo\\LtiBundle\\Entity\\ExternalTool;\n".
  "use Chamilo\\CourseBundle\\Entity\\CShortcut;\n".
  "use Doctrine\\Common\\Collections\\ArrayCollection;"
);
$old=<<<'OLD'
    public function save(ExternalTool $baseTool, Course $course): ExternalTool
    {
        $newTool = $this->createTool($baseTool);
        $newTool->setActiveDeepLinking(false);

        $em = Database::getManager();

        $em->persist($newTool);
        $em->flush();

        ImsLtiPlugin::create()->addCourseTool($course, $newTool);
    }
OLD;
$new=<<<'NEW'
    public function save(ExternalTool $baseTool, Course $course): ExternalTool
    {
        $em = Database::getManager();
        $user = api_get_user_entity();
        if (null === $user) {
            throw new RuntimeException('Authenticated teacher required');
        }

        $newTool = $this->createTool($baseTool);
        $newTool->setActiveDeepLinking(false);

        // Returning the same signed selection twice must not duplicate a
        // course resource or overwrite an existing gradebook association.
        foreach ($em->getRepository(ExternalTool::class)->findBy([
            'launchUrl' => $newTool->getLaunchUrl(),
        ]) as $existing) {
            if ($existing->getToolParent()?->getId() === $baseTool->getId()
                && $existing->getTitle() === $newTool->getTitle()
                && $existing->getCustomParams() === $newTool->getCustomParams()
                && null !== $existing->getFirstResourceLinkFromCourseSession($course)) {
                return $existing;
            }
        }

        // The native Chamilo 2/3 resource model uses ResourceLink and
        // CShortcut; legacy CTool.link/CTool.setTarget no longer exist.
        $newTool->setResourceNode(null);
        $newTool->setGradebookEval(null);
        $newTool->setLineItems(new ArrayCollection());
        $newTool->setToolParent($baseTool);
        $newTool->addCourseLink($course);
        $em->persist($newTool);
        $em->flush();

        $shortcutRepository = $em->getRepository(CShortcut::class);
        $shortcut = $shortcutRepository->addShortCut($newTool, $user, $course);
        $shortcut->setTitle($newTool->getTitle());
        $shortcut->target = $newTool->getDocumentTarget() === 'iframe' ? '_self' : '_blank';
        $em->persist($shortcut);
        $shortcutRepository->setVisibilityPublished($shortcut, $course, null);
        $em->flush();

        return $newTool;
    }
NEW;
substituteOnce($resource,$old,$new);
substituteOnce($resource,
  '        $this->custom = empty($itemData->custom) || !is_array($itemData->custom) ? [] : (array) $itemData->custom;',
  '        $this->custom = empty($itemData->custom) || (!is_array($itemData->custom) && !$itemData->custom instanceof stdClass) ? [] : (array) $itemData->custom;'
);
// Fully inspect all files before writing; syntax validation comes next.
foreach($parts as $source=>$content){
  if(file_put_contents($source,$content)===false)throw new RuntimeException('Cannot write Chamilo compatibility source');
}
echo "IMS_LTI_DEEP_LINK_RESPONSE_FIXED=".count($parts)."\n";