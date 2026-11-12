#!/usr/bin/env python3
"""Offline regression of the bundled ChatGPT P2LRN authoring subset."""
from __future__ import annotations

import copy
import json
import tempfile
import unittest
import warnings
import zipfile
from pathlib import Path

from p2lrn_package import CourseError, build, verify, valid_question


def sample(multiple=True, as_game=False):
    question = {
        'id': 'tf1', 'type': 'true-false', 'trueFalseMode': 'multiple',
        'prompt': 'Indica el valor de cada afirmación', 'points': 3,
        'statements': [
            {'id': 's1', 'text': 'El agua es una molécula'},
            {'id': 's2', 'text': 'La Tierra es una estrella'},
            {'id': 's3', 'text': 'Un hexágono tiene seis lados'},
        ],
        'solution': {'answers': {'s1': True, 's2': False, 's3': True}},
    } if multiple else {
        'id': 'tf1', 'type': 'true-false', 'prompt': 'La Tierra es una estrella',
        'points': 1, 'choices': [{'id': 'y', 'text': 'Verdadero'}, {'id': 'n', 'text': 'Falso'}],
        'solution': {'choiceIds': ['n']},
    }
    return {
        'title': 'Verificación de P2LRN con varias afirmaciones',
        'language': 'es', 'author': 'Autora de prueba', 'license': 'CC BY 4.0',
        'copyrightHolder': 'Titular de prueba', 'createdAt': '2026-10-27',
        'units': [{'title': 'Unidad verificada', 'lessons': [
            {'type': 'lesson', 'title': 'Introducción', 'text': 'Contenido del curso'},
            {'type': 'game' if as_game else 'quiz', 'kind': 'true-false' if as_game else None,
             'title': 'Evaluación', 'questions': [question]},
        ]}],
    }


class SkillP2LRNTests(unittest.TestCase):
    def test_legacy_and_new_true_false_modes(self):
        for multiple in (True, False):
            with self.subTest(multiple=multiple), tempfile.TemporaryDirectory() as folder:
                destination=Path(folder)/'test.p2lrn'
                result=build(sample(multiple),destination)
                self.assertTrue(result['valid'])
                checked=verify(destination)
                self.assertEqual(checked['contentRoot'],result['contentRoot'])
                with zipfile.ZipFile(destination) as z:
                    manifest=json.loads(z.read('META-INF/manifest.json'))
                    graph=json.loads(z.read('content/graph.json'))
                    course=next(e for e in graph['entities'] if e['type']=='course')
                    rights=course['extensions']['https://p2lrn.org/ext/course-rights/1']
                    self.assertEqual(rights['createdAt'],'2026-10-27')
                    self.assertEqual(set(rights),{'author','createdAt','license','copyrightHolder'})
                    self.assertEqual(manifest['formatVersion'],'0.4.0')
                    questionnaire_file=next(x['path'] for x in manifest['files']
                                            if x['mediaType']=='application/vnd.p2lrn.questionnaire+json')
                    questionnaire=json.loads(z.read(questionnaire_file))
                    self.assertEqual(questionnaire['questions'][0].get('trueFalseMode','single'),
                                     'multiple' if multiple else 'single')

    def test_true_false_multiple_game(self):
        with tempfile.TemporaryDirectory() as folder:
            result=build(sample(multiple=True,as_game=True),Path(folder)/'game.p2lrn')
            self.assertEqual(result['counts']['games'],1)
            self.assertTrue(result['valid'])

    def test_missing_statement_rejected(self):
        c=sample();q=c['units'][0]['lessons'][1]['questions'][0]
        del q['solution']['answers']['s2']
        with self.assertRaisesRegex(CourseError,'answer is required for each true/false statement'):
            valid_question(q,1)

    def test_non_boolean_and_ambiguous_statement_rejected(self):
        q=sample()['units'][0]['lessons'][1]['questions'][0]
        q['solution']['answers']['s2']=0
        with self.assertRaisesRegex(CourseError,'one boolean answer'):
            valid_question(q,1)
        q=sample()['units'][0]['lessons'][1]['questions'][0]
        q['statements'][1]['id']='s1'
        with self.assertRaisesRegex(CourseError,'duplicate'):
            valid_question(q,1)

    def test_false_positive_choices_in_multiple_rejected(self):
        q=sample()['units'][0]['lessons'][1]['questions'][0]
        q['choices']=[{'id':'y','text':'Sí'},{'id':'n','text':'No'}]
        with self.assertRaisesRegex(CourseError,'cannot use legacy choices'):
            valid_question(q,1)

    def test_refuses_zip_symlinks(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'linked.p2lrn'
            with zipfile.ZipFile(path,'w') as z:
                info=zipfile.ZipInfo('symlink');info.external_attr=(0o120777 << 16)
                z.writestr(info,'target')
            with self.assertRaisesRegex(CourseError,'Symbolic links'):
                verify(path)

    def test_refuses_zip_bombs_before_extraction(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'huge.p2lrn'
            with zipfile.ZipFile(path,'w',compression=zipfile.ZIP_DEFLATED) as z:
                z.writestr('large.txt',b'x'*(40*1024*1024+1))
            self.assertLess(path.stat().st_size,100_000)
            with self.assertRaisesRegex(CourseError,'ZIP member exceeds'):
                verify(path)

    def test_rejects_duplicate_zip_members(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'duplicated.p2lrn'
            with warnings.catch_warnings():
                warnings.simplefilter('ignore',UserWarning)
                with zipfile.ZipFile(path,'w') as z:
                    z.writestr('content/graph.json','{}')
                    z.writestr('content/graph.json','{}')
            with self.assertRaisesRegex(CourseError,'Duplicate ZIP'):
                verify(path)


if __name__=='__main__':
    unittest.main(verbosity=2)
