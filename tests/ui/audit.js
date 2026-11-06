const puppeteer=require('puppeteer-core');const path=require('path');
const CHROME=process.env.CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL='file:///'+path.resolve(__dirname,'..','..','index.html').replace(/\\/g,'/');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const tap=(p,s)=>p.evaluate(sel=>{const el=document.querySelector(sel);if(el){el.click();return true}return false},s);
const SIZES=[[731,412],[667,375],[800,360],[640,360],[915,412]];
(async()=>{
 const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--allow-file-access-from-files','--no-sandbox']});
 let bad=0;
 for(const [w,h] of SIZES){
   const p=await b.newPage();await p.setViewport({width:w,height:h,deviceScaleFactor:2});
   await p.goto(URL,{waitUntil:'load'});
   await p.evaluate(()=>{try{localStorage.clear()}catch(e){}});
   await p.reload({waitUntil:'load'});
   await sleep(150);await tap(p,'#enterGuandan');await sleep(600);
   const r=await p.evaluate(()=>{
     const vw=innerWidth, vh=innerHeight, out=[];
     const push=(name,el,tol)=>{if(!el)return;const b=el.getBoundingClientRect();
       if(b.left<-1||b.top<-1||b.right>vw+1||b.bottom>vh+1) out.push(`${name} [${Math.round(b.left)},${Math.round(b.top)},${Math.round(b.right)},${Math.round(b.bottom)}] vp=${vw}x${vh}`);};
     push('hand',document.getElementById('hand'),1);
     document.querySelectorAll('#hand .card').forEach((c,i)=>{const b=c.getBoundingClientRect();
       if(b.left<-1||b.right>vw+1||b.bottom>vh+1) out.push(`card${i} [${Math.round(b.left)},${Math.round(b.top)},${Math.round(b.right)},${Math.round(b.bottom)}]`);});
     ['btnPlay','btnPass','btnHint','btnChat','btnCounter','btnTrust','btnExit'].forEach(id=>push(id,document.getElementById(id)));
     ['p0','p1','p2','p3'].forEach(id=>push(id,document.getElementById(id)));
     const cb=document.getElementById('counterBar');
     return {out, handW:document.getElementById('hand').clientWidth, cards:document.querySelectorAll('#hand .card').length, cbH:cb.getBoundingClientRect().height};
   });
   if(r.out.length){bad++;console.log(`✗ ${w}x${h}`,r.out.slice(0,6));}
   else console.log(`✓ ${w}x${h} cards=${r.cards} handW=${r.handW} cbH=${Math.round(r.cbH)}`);
   await p.close();
 }
 console.log(bad?`${bad} 个尺寸有问题`:'全部尺寸通过');
 await b.close();
 process.exitCode=bad?1:0;
})();
