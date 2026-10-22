const TOKEN_RE=/\{\{([A-Za-z0-9][A-Za-z0-9._:-]{0,159})\}\}/g;

const normalize=(value)=>String(value??'').normalize('NFKC').trim().toLocaleLowerCase('es');
const escapeRegExp=(value)=>String(value).replace(/[.*+?^$()|[\]\\{}]/g,'\\$&');

export function fillBlankInputMode(question){
  return question?.inputMode==='drag'?'drag':'text';
}

export function fillBlankPrimaryAnswer(question,blankId){
  const values=question?.solution?.answers?.[blankId];
  return Array.isArray(values)&&values.length?String(values[0]??'').trim():'';
}

export function fillBlankTemplate(question){
  const hasBody=typeof question?.body==='string'&&question.body.trim().length>0;
  let template=hasBody?String(question.body):String(question?.prompt??'');
  const blanks=Array.isArray(question?.blanks)?question.blanks:[];
  for(const blank of blanks){
    const id=String(blank?.id??'');
    if(!id)continue;
    const token='{{'+id+'}}';
    if(template.includes(token))continue;
    const answer=fillBlankPrimaryAnswer(question,id);
    if(answer){
      const match=new RegExp(escapeRegExp(answer),'i').exec(template);
      if(match){
        template=template.slice(0,match.index)+token+template.slice(match.index+match[0].length);
        continue;
      }
    }
    template+=(template&&!/\s$/.test(template)?' ':'')+token;
  }
  return {template,usesPrompt:!hasBody};
}

export function fillBlankParts(question){
  const {template,usesPrompt}=fillBlankTemplate(question);
  const known=new Set((question?.blanks??[]).map((blank)=>String(blank.id)));
  const parts=[];
  let last=0;
  TOKEN_RE.lastIndex=0;
  for(const match of template.matchAll(TOKEN_RE)){
    if(match.index>last)parts.push({type:'text',text:template.slice(last,match.index)});
    if(known.has(match[1]))parts.push({type:'blank',id:match[1]});
    else parts.push({type:'text',text:match[0]});
    last=match.index+match[0].length;
  }
  if(last<template.length)parts.push({type:'text',text:template.slice(last)});
  return {template,usesPrompt,parts};
}

export function fillBlankPromptLeaksAnswer(question){
  const prompt=normalize(question?.prompt);
  if(!prompt)return false;
  for(const blank of question?.blanks??[]){
    for(const raw of question?.solution?.answers?.[blank.id]??[]){
      const answer=normalize(raw);
      if(answer&&prompt.includes(answer))return true;
    }
  }
  return false;
}

export function fillBlankWordBank(question){
  const required=[];
  const optionPool=[];
  for(const blank of question?.blanks??[]){
    const primary=fillBlankPrimaryAnswer(question,blank.id);
    if(primary)required.push(primary);
    if(Array.isArray(blank?.options))for(const option of blank.options){
      const text=String(option??'').trim();
      if(text)optionPool.push(text);
    }
  }
  const counts=new Map();
  for(const text of required){
    const key=normalize(text);
    counts.set(key,(counts.get(key)??0)+1);
  }
  const bank=[...required];
  for(const text of optionPool){
    const key=normalize(text);
    if(!key)continue;
    if((counts.get(key)??0)>0)continue;
    counts.set(key,1);
    bank.push(text);
  }
  return bank.map((text,index)=>({id:'word-'+index,text}));
}

export function fillBlankDistractors(question){
  const correct=new Set((question?.blanks??[]).flatMap((blank)=>question?.solution?.answers?.[blank.id]??[]).map(normalize));
  const out=[];const seen=new Set();
  for(const blank of question?.blanks??[])for(const option of blank?.options??[]){
    const text=String(option??'').trim(),key=normalize(text);
    if(!key||correct.has(key)||seen.has(key))continue;
    seen.add(key);out.push(text);
  }
  return out;
}
