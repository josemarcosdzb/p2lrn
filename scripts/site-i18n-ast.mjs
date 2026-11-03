import * as acorn from 'acorn';

// Visit every child property, including single AST nodes such as a call's callee,
// a variable initializer and a property value. Without braces, the else binds
// to the innermost if, silently skipping those nodes.
export function parseJs(source) {
  try { return acorn.parse(source,{ecmaVersion:'latest',sourceType:'module'}); }
  catch { return acorn.parse(source,{ecmaVersion:'latest',sourceType:'script'}); }
}
export function walkAst(node,visit,parent=null) {
  if(!node||typeof node!=='object'||typeof node.type!=='string')return;
  visit(node,parent);
  for(const [key,value] of Object.entries(node)){
    // AST Property.value can be an expression node. Skipping it silently
    // drops navigation labels and strings inside object-valued fields.
    if(['start','end','loc','range','raw'].includes(key))continue;
    if(Array.isArray(value)){
      for(const child of value){
        if(child&&typeof child==='object'&&typeof child.type==='string')walkAst(child,visit,node);
      }
    }else if(value&&typeof value==='object'&&typeof value.type==='string'){
      walkAst(value,visit,node);
    }
  }
}
export function structuralLiteral(node,parent){
  if(!parent)return false;
  if((parent.type==='ImportDeclaration'||parent.type==='ExportNamedDeclaration'||parent.type==='ExportAllDeclaration')&&parent.source===node)return true;
  return parent.type==='Property'&&parent.key===node&&!parent.computed;
}
