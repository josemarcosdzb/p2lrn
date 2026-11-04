// Optional first-party bearer authentication adapter for P2LRN host routes.
// Caller pins issuer, audience and JWKS endpoint. No URL/query-string tokens,
// no unsigned JWTs, no implicit tenant/role authorization.
import {createPublicKey,verify as verifySignature} from 'node:crypto';

const ALGORITHMS=Object.freeze({
  RS256:{type:'RSA',digest:'RSA-SHA256'},
  ES256:{type:'EC',digest:'sha256',dsaEncoding:'ieee-p1363'},
  EdDSA:{type:'OKP',digest:null},
});
const b64u=/^[A-Za-z0-9_-]+$/;
function object(value){return value!==null&&typeof value==='object'&&!Array.isArray(value);}
function decodePart(value,maxBytes){
  if(typeof value!=='string'||value.length>maxBytes*2||!b64u.test(value))return null;
  try{
    const bytes=Buffer.from(value,'base64url');
    if(bytes.length===0||bytes.length>maxBytes)return null;
    const parsed=JSON.parse(bytes.toString('utf8'));
    return object(parsed)?parsed:null;
  }catch{return null;}
}
function audMatches(value,allowed){
  const found=Array.isArray(value)?value:[value];
  return found.some(item=>typeof item==='string'&&allowed.includes(item));
}
function selectKey(jwks,header,allowedAlgorithms){
  if(!object(jwks)||!Array.isArray(jwks.keys)||jwks.keys.length>32)return null;
  const alg=ALGORITHMS[header.alg];
  if(!alg||!allowedAlgorithms.includes(header.alg))return null;
  const keys=jwks.keys.filter(k=>object(k)&&k.kid===header.kid&&
    k.kty===alg.type&&(!k.alg||k.alg===header.alg)&&(!k.use||k.use==='sig')&&
    (!k.key_ops||(Array.isArray(k.key_ops)&&k.key_ops.includes('verify'))));
  if(keys.length!==1)return null; // Duplicate kid is ambiguous and unsafe.
  try{return createPublicKey({key:keys[0],format:'jwk'});}catch{return null;}
}

/**
 * Return an authenticate(request) function for createP2LRNCollaborationHandler.
 * Required issuer/audience/JWKS are configured by the trusted Host. The Host
 * must independently resolve enrollment and per-room authorization.
 */
export function createP2LRNJwtAuthenticator({
  issuer,audience,jwksUri,allowedAlgorithms=['RS256'],clockSkewSeconds=30,
  fetchImpl=fetch,cacheMs=300000,
}={}){
  if(typeof issuer!=='string'||!issuer||typeof jwksUri!=='string')
    throw new TypeError('JWT issuer and jwksUri are required.');
  const url=new URL(jwksUri);
  if(url.protocol!=='https:'||url.username||url.password||url.hash)
    throw new TypeError('JWT JWKS endpoint must be an explicit HTTPS URL.');
  const audiences=Array.isArray(audience)?audience:[audience];
  if(!audiences.length||audiences.some(a=>typeof a!=='string'||!a))
    throw new TypeError('JWT audience must be specified.');
  if(!Array.isArray(allowedAlgorithms)||!allowedAlgorithms.length||
    allowedAlgorithms.some(a=>!Object.hasOwn(ALGORITHMS,a)))
    throw new TypeError('Unsupported JWT signing algorithm.');
  if(!Number.isInteger(clockSkewSeconds)||clockSkewSeconds<0||clockSkewSeconds>120||
     !Number.isInteger(cacheMs)||cacheMs<1000||cacheMs>3600000)
    throw new TypeError('Invalid JWT clock skew or cache period.');
  if(typeof fetchImpl!=='function')throw new TypeError('fetchImpl must be a function.');
  let cache=null,expiresAt=0,pending=null,lastRefresh=0;
  async function loadKeys(force=false){
    const now=Date.now();
    if(cache&&!force&&now<expiresAt)return cache;
    if(pending)return pending;
    if(force&&cache&&now-lastRefresh<30000)return cache;
    pending=(async()=>{
      const response=await fetchImpl(url.href,{
        method:'GET',redirect:'error',headers:{Accept:'application/json'},
        signal:AbortSignal.timeout(5000),
      });
      if(!response.ok)throw new Error('JWKS unavailable.');
      const text=await response.text();
      if(text.length>262144)throw new Error('JWKS response too large.');
      const parsed=JSON.parse(text);
      if(!object(parsed)||!Array.isArray(parsed.keys)||parsed.keys.length>32)
        throw new Error('Invalid JWKS.');
      cache=parsed;lastRefresh=Date.now();expiresAt=lastRefresh+cacheMs;
      return cache;
    })();
    try{return await pending;}finally{pending=null;}
  }
  return async function authenticateP2LRNJWT(request){
    try{
      const authorization=request?.headers?.authorization;
      if(typeof authorization!=='string'||authorization.length>16384)return null;
      const match=/^Bearer ([A-Za-z0-9._-]+)$/.exec(authorization);
      if(!match)return null;
      const parts=match[1].split('.');
      if(parts.length!==3||!parts.every(p=>p&&b64u.test(p)))return null;
      const header=decodePart(parts[0],2048),claims=decodePart(parts[1],8192);
      if(!header||!claims||!allowedAlgorithms.includes(header.alg)||
        !Object.hasOwn(ALGORITHMS,header.alg)||typeof header.kid!=='string'||
        !/^[a-zA-Z0-9._-]{1,128}$/.test(header.kid)||
        (header.typ!==undefined&&header.typ!=='JWT')||
        header.crit!==undefined||header.jku!==undefined||header.x5u!==undefined)
        return null;
      if(claims.iss!==issuer||!audMatches(claims.aud,audiences)||
        typeof claims.sub!=='string'||claims.sub.length<1||claims.sub.length>512)
        return null;
      const now=Math.floor(Date.now()/1000),skew=clockSkewSeconds;
      if(!Number.isSafeInteger(claims.exp)||claims.exp<=now-skew||
        claims.nbf!==undefined&&(!Number.isSafeInteger(claims.nbf)||claims.nbf>now+skew)||
        claims.iat!==undefined&&(!Number.isSafeInteger(claims.iat)||claims.iat>now+skew))
        return null;
      let jwks=await loadKeys();
      let publicKey=selectKey(jwks,header,allowedAlgorithms);
      if(!publicKey){jwks=await loadKeys(true);publicKey=selectKey(jwks,header,allowedAlgorithms);}
      if(!publicKey)return null;
      const algorithm=ALGORITHMS[header.alg];
      const valid=verifySignature(algorithm.digest,Buffer.from(parts[0]+'.'+parts[1]),
        {...(algorithm.dsaEncoding?{dsaEncoding:algorithm.dsaEncoding}:{}),key:publicKey},
        Buffer.from(parts[2],'base64url'));
      if(!valid)return null;
      return Object.freeze({id:claims.sub,issuer:claims.iss,subjectId:claims.sub});
    }catch{return null;} // Fail closed, including network outages and bad keys.
  };
}
