import {mkdir, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {P2LRNAuthoringWorkspace} from '@p2lrn/toolkit/authoring';

const outputRoot=resolve(process.argv[2] ?? './p2lrn-game-3d-output');
const workspaceRoot=join(outputRoot,'workspace');
const sourceRoot=join(outputRoot,'source');
await mkdir(sourceRoot,{recursive:true});

const questionnaire={
  schema:'https://p2lrn.org/schema/native-questionnaire/0.4.0',
  version:'0.4.0',
  title:'Laboratorio Quest 3D portable',
  description:'Ordena, relaciona y clasifica con el renderer 3D independiente de cualquier LMS.',
  language:'es',
  grading:{mode:'embedded-key'},
  presentation:{questionMode:'one-at-a-time',shuffleQuestions:false,showFeedback:'after-submit'},
  questions:[
    {
      id:'orden',
      type:'ordering',
      prompt:'Ordena las fases del ciclo del agua.',
      points:3,
      required:true,
      items:[
        {id:'evaporacion',text:'Evaporación'},
        {id:'condensacion',text:'Condensación'},
        {id:'precipitacion',text:'Precipitación'},
      ],
      solution:{order:['evaporacion','condensacion','precipitacion']},
    },
    {
      id:'relacion',
      type:'matching',
      prompt:'Relaciona cada concepto con su descripción.',
      points:3,
      required:true,
      left:[
        {id:'solido',text:'Sólido'},
        {id:'liquido',text:'Líquido'},
        {id:'gas',text:'Gas'},
      ],
      right:[
        {id:'forma',text:'Forma propia'},
        {id:'recipiente',text:'Adopta el recipiente'},
        {id:'expande',text:'Se expande'},
      ],
      solution:{
        pairs:[
          {left:'solido',right:'forma'},
          {left:'liquido',right:'recipiente'},
          {left:'gas',right:'expande'},
        ],
      },
    },
    {
      id:'clasifica',
      type:'classification',
      prompt:'Clasifica los elementos por su naturaleza.',
      points:4,
      required:true,
      items:[
        {id:'perro',text:'Perro'},
        {id:'roble',text:'Roble'},
        {id:'gato',text:'Gato'},
        {id:'pino',text:'Pino'},
      ],
      categories:[
        {id:'animal',text:'Animal'},
        {id:'planta',text:'Planta'},
      ],
      solution:{
        assignments:[
          {item:'perro',category:'animal'},
          {item:'gato',category:'animal'},
          {item:'roble',category:'planta'},
          {item:'pino',category:'planta'},
        ],
      },
    },
  ],
};

const questionnairePath=join(sourceRoot,'quest-3d.json');
await writeFile(questionnairePath,JSON.stringify(questionnaire,null,2)+'\n');

const workspace=P2LRNAuthoringWorkspace.create(workspaceRoot,{
  title:'Quest 3D portable',
  language:'es',
  description:'Ejemplo P2LRN con Three.js, Rapier y mecánicas 3D.',
  force:true,
});
workspace.addQuestionnaire({
  source:questionnairePath,
  key:'quest-3d',
  title:'Laboratorio Quest 3D',
  renderer:'https://p2lrn.org/renderer/questionnaire/3d-order-match',
});
const outputPackage=join(outputRoot,'quest-3d-course.p2lrn');
workspace.build(outputPackage,{strictProfiles:true});
console.log(outputPackage);
