// Protect genuine SQL integration tests from accidental production targets.
const vars={postgres:'P2LRN_TEST_POSTGRES_URL',mysql:'P2LRN_TEST_MYSQL_URL',
 mariadb:'P2LRN_TEST_MARIADB_URL',sqlserver:'P2LRN_TEST_SQLSERVER_URL'};
const protocols={postgres:['postgres:','postgresql:'],mysql:['mysql:'],
 mariadb:['mariadb:'],sqlserver:['sqlserver:']};

export function resolveAsyncLtiTestDatabase(){
 const optIn=process.env.P2LRN_TEST_LTI_ASYNC_ENABLE;
 const engine=process.env.P2LRN_TEST_LTI_ASYNC_ENGINE;
 if(optIn===undefined&&engine===undefined)return null;
 if(optIn!=='YES'||!Object.hasOwn(vars,engine))
  throw new Error('LTI_TEST_DB_EXPLICIT_OPT_IN_REQUIRED');
 const raw=process.env[vars[engine]];
 if(!raw)throw new Error('LTI_TEST_DB_URL_REQUIRED');
 let uri;
 try{uri=new URL(raw);}catch{throw new Error('LTI_TEST_DB_INVALID_URL');}
 const name=decodeURIComponent(uri.pathname.slice(1));
 if(!protocols[engine].includes(uri.protocol)||
    !['localhost','127.0.0.1','[::1]'].includes(uri.hostname)||
    !/^p2lrn_(?:test|qa)(?:_[a-z0-9]+)?$/i.test(name)||
    !uri.username||!uri.password)
  throw new Error('LTI_TEST_DB_UNSAFE_TARGET');
 return Object.freeze({dbEngine:engine,dbUrl:raw});
}
