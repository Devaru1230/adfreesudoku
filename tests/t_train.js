// Playwright test for "Learn the moves".  Run:  node tests/t_train.js
const { chromium } = require('playwright');
const path = require('path');
const ok=(n,c,x)=>console.log((c?"PASS":"FAIL")+"  "+n+(x?"  "+x:""));
const F='file://'+path.resolve(__dirname,'../index.html');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({viewport:{width:412,height:860}, offline:true});
  const ext=[]; await ctx.route('**', r=>{ const u=r.request().url(); if(!u.startsWith('file:')&&!u.startsWith('data:')){ext.push(u);return r.abort();} r.continue(); });
  const p = await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('dialog',d=>d.accept());
  await p.addInitScript(()=>{ if(!localStorage.getItem("sdk_profile")){ localStorage.setItem("sdk_profile",JSON.stringify({name:"Blue Tokai",created:1})); localStorage.setItem("sdk_tut_done","true"); } });
  await p.goto(F); await p.waitForTimeout(600);

  // ---- every claim the coach makes is checked against the puzzle's real solution ----
  const facts = await p.evaluate(()=>{
    const bad=[], counts={}; let misses=0;
    const has=(C,i,d)=>C[i]&&C[i].has(d);
    for(const l of TR_LESSONS){ counts[l.id]=0;
      for(let k=0;k<(l.id==="guess"?60:120);k++){
        const ex=trFind(l.id, 50000+k*7919); if(!ex){ misses++; continue; } counts[l.id]++;
        const bd=ex.bd, sol=ex.sol, C=trCands(bd);
        for(let i=0;i<81;i++) if(bd[i] && bd[i]!==sol[i]) bad.push(l.id+" board disagrees with the solution");
        if(l.id==="guess"){
          const G=ex.C;
          for(let i=0;i<81;i++) if(G[i] && !G[i].has(sol[i])) bad.push("guess: a pencil mark set lost the real answer");
          if(G[ex.cell].size!==2) bad.push("guess: calculated-guess square does not have exactly 2 options");
          if(G[ex.hail].size<3) bad.push("guess: Hail Mary square has fewer than 3 options");
          if(trDeadEnd(bd,G,ex.cell,sol[ex.cell])>=0) bad.push("guess: the right answer was reported as a dead end");
          continue;
        }
        const m=ex.move;
        if(sol[m.cell]!==m.d) bad.push(l.id+" answer is wrong");
        if(l.id==="full"){ const e=TR_UNITS[m.unit].filter(i=>!bd[i]); if(e.length!==1||e[0]!==m.cell) bad.push("full: unit does not have exactly one gap"); }
        if(l.id==="naked"){ if(C[m.cell].size!==1) bad.push("naked: square has more than one option");
          const seen=new Set(); trUnitsOf(m.cell).forEach(u=>TR_UNITS[u].forEach(i=>{ if(bd[i]) seen.add(bd[i]); }));
          if(seen.size!==8 || seen.has(m.d)) bad.push("naked: 'only "+m.d+" is left' is not true"); }
        if(l.id==="hbox"||l.id==="hline"){
          if((l.id==="hbox")!==(m.unit>=18)) bad.push(l.id+": wrong kind of unit");
          const spots=TR_UNITS[m.unit].filter(i=>has(C,i,m.d)); if(spots.length!==1||spots[0]!==m.cell) bad.push(l.id+": not the only home");
          if(TR_UNITS[m.unit].some(i=>bd[i]===m.d)) bad.push(l.id+": the unit already has that number");
          TR_UNITS[m.unit].filter(i=>!bd[i]&&i!==m.cell).forEach(e=>{ if(!PEERS[e].some(q=>bd[q]===m.d)) bad.push(l.id+": a square has no outlined blocker"); }); }
        if(l.id==="point"||l.id==="pair"){
          const t=ex.tech;
          if(trSingles(bd,C).length) bad.push(l.id+": a sure shot was available, so the lesson is not needed");
          if(t.kind==="point"){ const inBox=TR_UNITS[t.box].filter(i=>has(C,i,t.d));
            if(inBox.length!==t.keys.length || !inBox.every(i=>t.keys.includes(i))) bad.push("point: outlined squares are not all the homes in the box");
            if(!t.keys.every(i=>TR_UNITS[t.line].includes(i))) bad.push("point: outlined squares are not on one line");
            t.elim.forEach(([i,d])=>{ if(!TR_UNITS[t.line].includes(i)||boxOf(i)===t.box-18||sol[i]===d) bad.push("point: a crossed-out mark was the real answer or off the line"); }); }
          else { t.keys.forEach(i=>{ if(C[i].size!==2||!t.ds.every(d=>C[i].has(d))) bad.push("pair: an outlined square is not a two-option square"); });
            t.elim.forEach(([i,d])=>{ if(sol[i]===d) bad.push("pair: a crossed-out mark was the real answer"); }); }
          const C2=ex.C;
          if(m.type==="naked" && C2[m.cell].size!==1) bad.push(l.id+": 'now only one fits' is not true");
          if(m.type==="hidden" && TR_UNITS[m.unit].filter(i=>has(C2,i,m.d)).length!==1) bad.push(l.id+": 'only this home' is not true");
          if(m.type==="hidden" && m.unit>=18 && t.kind==="point" && m.unit===t.box) bad.push("point: result is in the same box");
        }
      } }
    return {bad:[...new Set(bad)], counts, misses};
  });
  const total=Object.values(facts.counts).reduce((a,b)=>a+b,0);
  ok("every coach claim is true across "+total+" examples", facts.bad.length===0, facts.bad.slice(0,4).join(" | ")||JSON.stringify(facts.counts));
  ok("an example is found on at least 98% of tries (the app retries up to 6 times)", facts.misses <= (total+facts.misses)*0.02, facts.misses+" of "+(total+facts.misses)+" tries found nothing");

  // ---- the screens ----
  await p.evaluate(()=>showLevelPicker()); await p.waitForTimeout(150);
  ok("the New game menu has Learn the moves", await p.locator('#trainBtn').isVisible());
  await p.click('#trainBtn'); await p.waitForTimeout(150);
  ok("the lesson list shows 7 lessons, 3 locked in the free version", await p.evaluate(()=>document.querySelectorAll('.tr-lesson').length===7 && document.querySelectorAll('.tr-lesson.locked').length===3));
  ok("the four labels are explained", await p.evaluate(()=>["Sure shot","Calculated","Calculated guess","Hail Mary"].every(w=>document.querySelector('.tr-legend').textContent.includes(w))));
  await p.locator('.tr-lesson[data-l="point"]').click(); await p.waitForTimeout(150);
  ok("a Pro lesson opens the paywall in the free version", await p.evaluate(()=>document.getElementById('proVeil').classList.contains('show')));
  await p.click('#proClose');

  await p.locator('.tr-lesson[data-l="hbox"]').click(); await p.waitForSelector('#trBoard', {timeout:5000});
  ok("a free lesson opens with a marked square", await p.evaluate(()=>document.querySelectorAll('#trBoard .cell.tgt').length===1 && document.querySelectorAll('#trBoard .cell.l1').length===0));
  await p.click('#trWhy'); await p.waitForTimeout(80);
  ok("Show me why, step 1: the box gets the level 1 shade", await p.evaluate(()=>document.querySelectorAll('#trBoard .cell.l1').length===9 && document.querySelectorAll('#trBoard .cell.l2').length===0));
  await p.click('#trWhy'); await p.waitForTimeout(80);
  ok("step 2: the blocking lines get the level 2 shade and the blockers are outlined", await p.evaluate(()=>document.querySelectorAll('#trBoard .cell.l2').length>0 && document.querySelectorAll('#trBoard .cell.key').length>0));
  const ans = await p.evaluate(()=>TRV.ex.move.d);
  const wrong = await p.evaluate(()=>{ const m=TRV.ex.move; return [1,2,3,4,5,6,7,8,9].find(d=>d!==m.d && PEERS[m.cell].some(q=>TRV.ex.bd[q]===d)); });
  await p.locator('#trPad button').nth(wrong-1).dispatchEvent('pointerdown'); await p.waitForTimeout(80);
  ok("a wrong number is explained and the clash shown in red", await p.evaluate(()=>/already a/.test(document.getElementById('trCoach').textContent) && document.querySelectorAll('#trBoard .cell.bad').length===1 && !TRV.done));
  await p.locator('#trPad button').nth(ans-1).dispatchEvent('pointerdown'); await p.waitForTimeout(80);
  ok("the right number is accepted, labelled Sure shot, and counted", await p.evaluate((a)=>TRV.done && document.querySelector('#trBoard .cell.ans').textContent==String(a) &&
    /Sure shot/.test(document.getElementById('trCoach').textContent) && store.get("sdk_train",{}).hbox===1, ans));
  await p.click('#trNext'); await p.waitForSelector('#trBoard .cell.tgt', {timeout:5000});
  ok("Next example gives a fresh position", await p.evaluate(()=>!TRV.done));

  for(const id of ["full","naked","hline"]){
    await p.click('#trBack'); await p.locator('.tr-lesson[data-l="'+id+'"]').click(); await p.waitForSelector('#trBoard .cell.tgt', {timeout:5000});
    const d = await p.evaluate(()=>TRV.ex.move.d); await p.locator('#trPad button').nth(d-1).dispatchEvent('pointerdown'); await p.waitForTimeout(60);
    ok("lesson '"+id+"' can be solved", await p.evaluate(()=>TRV.done));
  }

  // ---- Pro lessons ----
  await p.evaluate(()=>{ store.set("sdk_pro", true); }); await p.reload(); await p.waitForTimeout(500);
  await p.evaluate(()=>{ document.querySelectorAll('.veil.show').forEach(v=>v.classList.remove('show')); trOpen(); });
  ok("with Pro nothing is locked", await p.evaluate(()=>document.querySelectorAll('.tr-lesson.locked').length===0));
  for(const id of ["point","pair"]){
    await p.locator('.tr-lesson[data-l="'+id+'"]').click(); await p.waitForSelector('#trBoard .cell.tgt', {timeout:8000});
    await p.click('#trWhy'); await p.click('#trWhy'); await p.waitForTimeout(60);
    const st = await p.evaluate(()=>({x:document.querySelectorAll('#trBoard .notes span.x').length, k:document.querySelectorAll('#trBoard .cell.key').length, chip:document.querySelector('.tr-top .tr-chip').textContent}));
    const d = await p.evaluate(()=>TRV.ex.move.d); await p.locator('#trPad button').nth(d-1).dispatchEvent('pointerdown'); await p.waitForTimeout(60);
    ok("Pro lesson '"+id+"': crossed-out marks shown, labelled Calculated, solvable", st.x>0 && st.k>=2 && st.chip==="Calculated" && await p.evaluate(()=>TRV.done), st.x+" marks crossed out");
    await p.click('#trBack');
  }
  await p.locator('.tr-lesson[data-l="guess"]').click(); await p.waitForSelector('#trBoard .cell.tgt', {timeout:8000});
  const g = await p.evaluate(()=>({opts:[...TRV.ex.C[TRV.ex.cell]], right:TRV.ex.sol[TRV.ex.cell]}));
  ok("When to guess: only the two options can be tapped, labelled Calculated guess", await p.evaluate(()=>document.querySelectorAll('#trPad button:not(.off)').length===2 && document.querySelector('.tr-top .tr-chip').textContent==="Calculated guess"));
  const wrongG = g.opts.find(x=>x!==g.right);
  await p.locator('#trPad button').nth(wrongG-1).dispatchEvent('pointerdown'); await p.waitForTimeout(80);
  ok("testing the wrong option explains the result truthfully", await p.evaluate((r)=>{ const t=document.getElementById('trCoach').textContent; return t.includes(String(r)) && (/dead end/.test(t)); }, g.right));
  await p.click('#trHail'); await p.waitForTimeout(80);
  ok("then a Hail Mary square is shown in red with its odds", await p.evaluate(()=>document.querySelector('.tr-top .tr-chip').textContent==="Hail Mary" && /1 in [3-9]/.test(document.getElementById('trCoach').textContent) && document.querySelectorAll('#trBoard .cell.bad').length===1));

  // ---- the rest of Sudoku still works ----
  await p.click('#trBack'); await p.click('#trClose'); await p.waitForTimeout(100);
  const game = await p.evaluate(()=>{ document.querySelectorAll('.veil.show').forEach(v=>v.classList.remove('show')); newGame(0); const i=S.puzzle.findIndex(v=>!v); S.sel=i; input(S.src.solution[i]); return {placed:S.grid[i]===S.src.solution[i], mistakes:S.mistakes}; });
  ok("a normal game still starts and accepts a correct number", game.placed && game.mistakes===0);

  // ---- fits a small phone ----
  const ctx3 = await b.newContext({viewport:{width:360,height:640}, offline:true}); const p3 = await ctx3.newPage();
  await p3.addInitScript(()=>{ localStorage.setItem("sdk_profile",JSON.stringify({name:"Blue Tokai",created:1})); localStorage.setItem("sdk_tut_done","true"); localStorage.setItem("sdk_pro","true"); });
  await p3.goto(F); await p3.waitForTimeout(500);
  const fit=[];
  for(const id of ["naked","point","guess"]){
    await p3.evaluate((id)=>{ document.querySelectorAll('.veil.show').forEach(v=>v.classList.remove('show')); trOpen(); trStart(TR_LESSONS.find(l=>l.id===id)); }, id);
    await p3.waitForSelector('#trBoard .cell.tgt', {timeout:8000});
    fit.push(await p3.evaluate((id)=>{ const pad=document.getElementById('trPad').getBoundingClientRect(), v=document.getElementById('trainView'); return {id, ok: pad.bottom<=innerHeight+1 && v.scrollHeight<=v.clientHeight+1, padBottom:Math.round(pad.bottom)}; }, id));
  }
  ok("each lesson fits on a 360x640 screen without scrolling", fit.every(f=>f.ok), fit.map(f=>f.id+" "+f.padBottom+"px").join(", "));
  await ctx3.close();

  ok("nothing fetched from the network", ext.length===0, ext.join(","));
  ok("no page errors", errs.length===0, errs.join(" | "));
  await b.close();
})();
