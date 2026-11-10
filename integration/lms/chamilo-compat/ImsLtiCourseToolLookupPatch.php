<?php
declare(strict_types=1);

// Chamilo IMS/LTI 1.9.0 course configuration uses retired Doctrine keys
// (cId/link) and an unsupported repository alias. Use mapped CTool fields.
// This is a fail-closed compatibility patch, not a database migration.
$file='/var/www/chamilo/public/plugin/ImsLti/ImsLtiPlugin.php';
$src=file_get_contents($file);
if(!is_string($src))throw new RuntimeException('IMS/LTI plugin source missing');
$before=<<<'OLD'
    public function findCourseToolByLink(Course $course, ExternalTool $ltiTool)
    {
        $em = Database::getManager();
        $toolRepo = $em->getRepository('ChamiloCourseBundle:CTool');

        /** @var CTool $cTool */
        $cTool = $toolRepo->findOneBy(
            [
                'cId' => $course,
                'link' => self::generateToolLink($ltiTool),
            ]
        );

        return $cTool;
    }
OLD;
$after=<<<'NEW'
    public function findCourseToolByLink(Course $course, ExternalTool $ltiTool)
    {
        $em = Database::getManager();
        $toolRepo = $em->getRepository(CTool::class);

        // c_id is the mapped association "course"; the old column "link"
        // no longer exists in CTool. Only match an unambiguous course tool.
        // Modern ExternalTool membership is independently checked through
        // getFirstResourceLinkFromCourseSession by the calling workflows.
        $candidates = $toolRepo->findBy([
            'course' => $course,
            'title' => $ltiTool->getTitle(),
        ]);
        if (1 !== count($candidates)) {
            return null;
        }

        $candidate = $candidates[0];
        if ($candidate->getTool()->getTitle() !== $ltiTool->getTitle()) {
            return null;
        }

        return $candidate;
    }
NEW;
if(substr_count($src,$after)===1){echo "IMS_LTI_COURSE_LOOKUP_ALREADY_APPLIED\n";exit(0);}
if(substr_count($src,$before)!==1)throw new RuntimeException('Unsupported Chamilo version: course lookup shape changed');
$fixed=str_replace($before,$after,$src);
if(file_put_contents($file,$fixed)===false)throw new RuntimeException('Cannot patch Chamilo IMS/LTI plugin');
echo "IMS_LTI_COURSE_LOOKUP_PATCHED\n";