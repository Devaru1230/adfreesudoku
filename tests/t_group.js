// Playwright test for group ranking and the opt-in global leaderboard.  Run:  node tests/t_group.js
const { chromium } = require('playwright');
const path = require('path');
const ok=(n,c,x)=>console.log((c?"PASS":"FAIL")+"  "+n+(x?"  "+x:""));
const F='file://'+path.resolve(__dirname,'../index.html');
(async () => {
  const b = await chromium.launch();
  const ext=[]; const errs=[];
  const phone = async (name, recs) => {
    const ctx = await b.newContext({viewport:{width:412,height:860}, offline:true});
    await ctx.route('**', r=>{ const u=r.request().url(); if(!u.startsWith('file:')&&!u.startsWith('data:')){ext.push(u);return r.abort();} r.continue(); });
    const p = await ctx.newPage(); p.on('pageerror',e=>errs.push(name+": "+e.message)); p.on('dialog',d=>d.accept());
    await p.addInitScript(([name,recs])=>{ if(!localStorage.getItem("sdk_profile")){ localStorage.setItem("sdk_profile",JSON.stringify({name,created:1})); localStorage.setItem("sdk_tut_done","true");
      localStorage.setItem("sdk_records",JSON.stringify(recs)); }
      window.__shared=[]; window.open=(u)=>{ window.__shared.push(decodeURIComponent(String(u).split("text=")[1]||"")); return null; }; }, [name, recs]);
    await p.goto(F); await p.waitForTimeout(500);
    await p.evaluate(()=>document.querySelectorAll('.veil.show').forEach(v=>v.classList.remove('show')));
    return {ctx, p};
  };
  const today = await (async()=>{ const {ctx,p}=await phone("x",[]); const n=await p.evaluate(()=>dailyNum()); await ctx.close(); return n; })();
  const R = (d,sec,m,w,dl,pp)=>({t:Date.now(), d, sec, m, sc:1000+pp, w, p:pp, dl});
  // Asha: rating ~1500, solved today's Daily in 6:40. Ravi: rating ~1200, Daily in 5:10 with 1 mistake. Me (Blue Tokai): rating ~1000.
  const A = await phone("Asha", [R(1,400,0,1,today,1500),R(1,500,0,1,0,1500),R(1,600,0,1,0,1500)]);
  const V = await phone("रवि",  [R(1,310,1,1,today,1200),R(1,450,0,1,0,1200),R(0,300,0,0,0,0)]);
  const M = await phone("Blue Tokai", [R(0,300,0,1,0,1000)]);

  // ---- every shared message carries a valid code ----
  const shareOf = async ph => { await ph.p.click('#tabTrends'); await ph.p.waitForTimeout(150); await ph.p.click('#shareRank'); return ph.p.evaluate(()=>window.__shared.slice(-1)[0]); };
  const msgA = await shareOf(A), msgV = await shareOf(V);
  ok("Share my rank includes a group code", /SDK1\./.test(msgA) && /Your group/.test(msgA));
  ok("a Hindi name survives the code", await M.p.evaluate(m=>{ const p=grpParse(m)[0]; return p && p.name==="रवि"; }, msgV));
  const endMsg = await M.p.evaluate(()=>{ newGame(0); const sol=S.src.solution; for(let i=0;i<81;i++){ if(!S.grid[i]){ S.sel=i; input(sol[i]); } } return S.shareTxt||""; });
  ok("the end-of-game WhatsApp message includes the code too", /SDK1\./.test(endMsg));
  await M.p.waitForTimeout(1300); await M.p.evaluate(()=>document.querySelectorAll('.veil.show').forEach(v=>v.classList.remove('show')));

  // ---- pasting friends' messages builds the group table ----
  await M.p.click('#tabTrends'); await M.p.waitForTimeout(150);
  ok("Your group card is on the Trends screen", await M.p.evaluate(()=>!!document.getElementById('grpCard') && /Add friends/.test(document.getElementById('grpCard').textContent)));
  await M.p.click('#grpAddBtn'); await M.p.fill('#grpText', "Asha said:\n"+msgA+"\n\nand Ravi said:\n"+msgV); await M.p.click('#grpGo'); await M.p.waitForTimeout(150);
  const t1 = await M.p.evaluate(()=>({ratings:[...document.querySelectorAll('#grpCard table')[0].querySelectorAll('tr')].map(r=>parseInt(r.children[2].textContent)), rows:[...document.querySelectorAll('#grpCard table')[0].querySelectorAll('tr')].map(r=>r.querySelector('.nm').textContent),
    me:document.querySelector('#grpCard tr.me .nm').textContent, daily:[...document.querySelectorAll('#grpCard table')[1].querySelectorAll('tr')].map(r=>r.querySelector('.nm').textContent+" "+r.children[2].textContent), toast:document.getElementById('toast').textContent}));
  ok("pasting two messages at once adds both players", /Added 2/.test(t1.toast), t1.toast);
  ok("the group is ranked by rating, highest first, with me highlighted", t1.rows.length===3 && t1.ratings.every((r,i)=>i===0||t1.ratings[i-1]>=r) && t1.rows.includes("रवि") && t1.me==="Blue Tokai",
     t1.rows.map((n,i)=>n+" "+t1.ratings[i]).join(" > "));
  ok("today's Daily is ranked by time", t1.daily.length===2 && t1.daily[0].startsWith("रवि 05:10 1 mistake") && t1.daily[1].startsWith("Asha 06:40"), t1.daily.join(" | "));
  await M.p.click('#grpShareBtn'); const dig = await M.p.evaluate(()=>window.__shared.slice(-1)[0]);
  ok("Share the table sends a ranked list with medals and my code", /🥇 Asha/.test(dig) && /⭐ Daily #/.test(dig) && /My code: SDK1\./.test(dig));

  // ---- bad, old and own codes ----
  const bad = await M.p.evaluate(m=>{ const c=m.match(/SDK1\.\S+/)[0]; const parts=c.split("."); parts[2]=(parseInt(parts[2],36)+500).toString(36); const forged=parts.join(".");
    const me=grpCode(); return {forged:grpParse(forged).length, cut:grpParse(c.slice(0,-3)).length, own:grpAdd(me).added, none:grpAdd("hello there").found}; }, msgA);
  ok("an edited or cut-off code is rejected, my own code is ignored", bad.forged===0 && bad.cut===0 && bad.own===0 && bad.none===0);
  const older = await M.p.evaluate(m=>{ const c=m.match(/SDK1\.\S+/)[0]; const p=grpParse(c)[0]; const old=Object.assign({},p,{rating:1,day:p.day-3}); grpAdd(grpCode(old)); return store.get("sdk_group",{})[p.id].rating; }, msgA);
  ok("an older code never replaces a newer one", older!==1);
  await M.p.evaluate(()=>{ window.confirm=()=>true; }); await M.p.locator('#grpCard .grp-x').first().click(); await M.p.waitForTimeout(100);
  ok("a player can be removed", await M.p.evaluate(()=>Object.keys(store.get("sdk_group",{})).length===1));
  await M.p.reload(); await M.p.waitForTimeout(500); await M.p.evaluate(()=>document.querySelectorAll('.veil.show').forEach(v=>v.classList.remove('show'))); await M.p.click('#tabTrends'); await M.p.waitForSelector('#grpCard table tr');
  ok("the group is kept after closing the app", await M.p.evaluate(()=>document.querySelectorAll('#grpCard table')[0].querySelectorAll('tr').length===2));
  ok("no network requests and no page errors with the group ranking", ext.length===0 && errs.length===0, ext.concat(errs).join(" | "));
  await A.ctx.close(); await V.ctx.close(); await M.ctx.close();

  // ---- the global leaderboard stays silent until the player joins ----
  const ctx = await b.newContext({viewport:{width:412,height:860}}); const sent=[];
  await ctx.route('**', r=>{ const u=r.request().url(); if(u.startsWith('file:')||u.startsWith('data:')) return r.continue();
    sent.push({method:r.request().method(), url:u, body:r.request().postData()});
    const rows = u.includes("/rest/v1/sudoku_players") ? JSON.stringify([{pid:"zz",name:'<img src=x onerror="window.__xss=1">',rating:2100,games:9,wins:8,best_score:3000}]) : '""';
    return r.fulfill({status:200, contentType:'application/json', body:rows}); });
  const p = await ctx.newPage(); p.on('pageerror',e=>errs.push("lb: "+e.message)); p.on('dialog',d=>d.accept());
  await p.addInitScript(()=>{ localStorage.setItem("sdk_profile",JSON.stringify({name:"Blue Tokai",created:1})); localStorage.setItem("sdk_tut_done","true"); });
  await p.goto(F); await p.waitForTimeout(400);
  await p.evaluate(()=>{ LB.url="https://lb.example.test"; LB.key="anon"; document.querySelectorAll('.veil.show').forEach(v=>v.classList.remove('show'));
    newGame(0); const sol=S.src.solution; for(let i=0;i<81;i++){ if(!S.grid[i]){ S.sel=i; input(sol[i]); } } });
  await p.waitForTimeout(1300); await p.evaluate(()=>document.querySelectorAll('.veil.show').forEach(v=>v.classList.remove('show')));
  await p.click('#tabTrends'); await p.waitForTimeout(300);
  ok("with the leaderboard switched on, nothing is sent or fetched before Join", sent.length===0 && await p.locator('#lbJoin').isVisible(), sent.length+" requests");
  await p.click('#lbJoin'); await p.waitForTimeout(400);
  const post = sent.find(s=>s.method==="POST" && s.url.endsWith("/rpc/sudoku_submit")); const keys = post ? Object.keys(JSON.parse(post.body)).sort().join(",") : "";
  ok("after Join, only name, rating, games, wins and best score are sent (plus the private id)", keys==="p_best,p_games,p_id,p_name,p_pid,p_rating,p_wins", keys);
  const get = sent.find(s=>s.method==="GET");
  ok("the board is read without anyone's private id", !!get && /select=pid,name,rating,games,wins,best_score&/.test(get.url));
  ok("a player name with code in it is shown as plain text, never run", await p.evaluate(()=>!window.__xss && /onerror/.test(document.getElementById('lbBody').textContent)));
  await p.click('#lbLeave'); await p.waitForTimeout(300);
  ok("Leave deletes the entry on the server", sent.some(s=>s.url.endsWith("/rpc/sudoku_leave") && JSON.parse(s.body).p_id));
  const n0 = sent.length;
  await p.evaluate(()=>{ newGame(0); const sol=S.src.solution; for(let i=0;i<81;i++){ if(!S.grid[i]){ S.sel=i; input(sol[i]); } } }); await p.waitForTimeout(1300);
  await p.evaluate(()=>{ document.querySelectorAll('.veil.show').forEach(v=>v.classList.remove('show')); renderTrends(); }); await p.waitForTimeout(300);
  ok("after Leave, nothing more is sent", sent.length===n0, (sent.length-n0)+" new requests");
  await ctx.close();
  ok("no page errors", errs.length===0, errs.join(" | "));
  await b.close();
})();
