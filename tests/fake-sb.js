(function(){
 function B(table){this.t=table;this.f=[];this.op='select';}
 B.prototype.select=function(c){if(this.op!=='upsert'&&this.op!=='delete')this.op='select';return this};
 B.prototype.eq=function(k,v){this.f.push(['eq',k,v]);return this};
 B.prototype.in=function(k,v){this.f.push(['in',k,v]);return this};
 B.prototype.order=function(){return this};
 B.prototype.range=function(a,b){this.r=[a,b];return this};
 B.prototype.maybeSingle=function(){this.single=true;return this};
 B.prototype.upsert=function(rows){this.op='upsert';this.rows=Array.isArray(rows)?rows:[rows];return this};
 B.prototype.delete=function(){this.op='delete';return this};
 B.prototype.then=function(res,rej){return window.__srv(JSON.stringify({op:this.op,t:this.t,f:this.f,r:this.r,rows:this.rows,single:!!this.single,tab:window.__TAB})).then(x=>JSON.parse(x)).then(res,rej)};
 var listeners=[],authCb=[];
 window.__rt=function(p){listeners.forEach(f=>f(p))};
 var sess=JSON.parse(localStorage.getItem('fake-sess')||'null');
 var client={
  auth:{onAuthStateChange(cb){authCb.push(cb);setTimeout(()=>cb('INITIAL_SESSION',sess),0);return{data:{subscription:{unsubscribe(){}}}}},
   signInWithPassword({email}){sess={user:{email,id:'u-'+email}};localStorage.setItem('fake-sess',JSON.stringify(sess));setTimeout(()=>authCb.forEach(c=>c('SIGNED_IN',sess)),0);return Promise.resolve({data:{session:sess},error:null})},
   signOut(){localStorage.removeItem('fake-sess');authCb.forEach(c=>c('SIGNED_OUT',null));return Promise.resolve({})},
   signUp(){return Promise.resolve({data:{},error:null})},signInWithOtp(){return Promise.resolve({error:null})},resetPasswordForEmail(){return Promise.resolve({error:null})},updateUser(){return Promise.resolve({error:null})}},
  rpc(n){return window.__srv(JSON.stringify({op:'rpc',n,email:sess&&sess.user.email})).then(JSON.parse)},
  from(t){return new B(t)},
  channel(){return{on(a,b,cb){listeners.push(cb);return this},subscribe(cb){setTimeout(()=>cb&&cb('SUBSCRIBED'),0);return this}}},
  storage:{from(){return{upload(p,b){return Promise.resolve({data:{path:p},error:null})},getPublicUrl(p){return{data:{publicUrl:'https://x.test/'+p}}},remove(){return Promise.resolve({})}}}}
 };
 window.supabase={createClient(){return client}};
})();
