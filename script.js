const $=s=>document.querySelector(s);
const fileInput=$("#fileInput"),selectBtn=$("#selectBtn"),dropzone=$("#dropzone");
const preview=$("#preview"),previewSection=$("#previewSection");
const fileInfo=$("#fileInfo"),outInfo=$("#outInfo"),savedInfo=$("#savedInfo"),prog=$("#prog");
const convertBtn=$("#convertBtn"),downloadBtn=$("#downloadBtn"),quality=$("#quality"),qualityVal=$("#qualityVal");
let currentFile=null;
function fmt(b){if(b<1024)return b+" B";if(b<1024*1024)return (b/1024).toFixed(1)+" KB";return (b/1024/1024).toFixed(2)+" MB";}
function reset(){if(outInfo)outInfo.textContent='';if(savedInfo)savedInfo.textContent='';if(prog)prog.style.width='0%';downloadBtn?.classList.add('hidden');convertBtn?.classList.remove('hidden');}
if(selectBtn)selectBtn.onclick=()=>fileInput.click();
if(dropzone){
  let c=0;
  ["dragenter","dragover"].forEach(ev=>dropzone.addEventListener(ev,e=>{e.preventDefault();c++;dropzone.classList.add('drag');}));
  ["dragleave","drop"].forEach(ev=>dropzone.addEventListener(ev,e=>{e.preventDefault();c--;if(c<=0)dropzone.classList.remove('drag');}));
  dropzone.addEventListener('drop',e=>{const f=e.dataTransfer.files[0];if(f)handle(f);});
}
if(fileInput)fileInput.onchange=e=>{const f=e.target.files[0];if(f)handle(f);};
function handle(f){
  if(!f.type.startsWith('image/')){fileInfo.textContent='Please choose an image';return;}
  currentFile=f;
  preview.src=URL.createObjectURL(f);
  fileInfo.innerHTML=`<strong>Original:</strong> ${f.name} — ${fmt(f.size)} — ${f.type}`;
  previewSection.classList.remove('hidden');
  reset();
  if(prog)prog.style.width='18%';
  previewSection.scrollIntoView({behavior:'smooth',block:'center'});
}
if(quality){quality.addEventListener('input',()=>{qualityVal.textContent=quality.value+'%';});}
if(convertBtn)convertBtn.onclick=async()=>{
  if(!currentFile)return;
  convertBtn.disabled=true;convertBtn.textContent='Converting...';
  if(prog)prog.style.width='55%';
  try{
    const fmt=document.body.dataset.format||'image/webp';
    const q=quality?parseFloat(quality.value)/100:parseFloat(document.body.dataset.quality||'0.85');
    const blob=await conv(currentFile,fmt,q);
    const orig=currentFile.size, nw=blob.size;
    const saved=((orig-nw)/orig*100);
    const disp=fmt.split('/')[1].toUpperCase();
    outInfo.innerHTML=`<strong>Output:</strong> ${disp} • ${fmt==='image/png'?'Lossless':'Quality '+(q*100).toFixed(0)+'%'} • ${fmt==='image/png'||fmt==='image/webp'?'Transparency ✓':'No transparency → white'}<br><strong>Size:</strong> ${(nw/1024).toFixed(1)} KB (${nw} bytes)`;
    savedInfo.innerHTML=`Original: <strong>${(orig/1024).toFixed(1)} KB</strong> → New: <strong>${(nw/1024).toFixed(1)} KB</strong> — <span style="color:${nw<orig?'#22c55e':'#f59e0b'}">${nw<orig?'Saved '+saved.toFixed(1)+'%':'Larger by '+Math.abs(saved).toFixed(1)+'%'}</span>`;
    downloadBtn.href=URL.createObjectURL(blob);
    const ext=fmt.split('/')[1].replace('jpeg','jpg');
    downloadBtn.download=`${currentFile.name.replace(/\.[^/.]+$/,'')}.${ext}`;
    downloadBtn.classList.remove('hidden');
    convertBtn.classList.add('hidden');
    if(prog)prog.style.width='100%';
  }catch(e){outInfo.textContent='Failed: '+e.message;}
  finally{convertBtn.disabled=false;convertBtn.textContent='Convert';}
};
function conv(file,format,quality){
  return new Promise((res,rej)=>{
    const img=new Image();
    img.onload=()=>{
      const canvas=document.createElement('canvas');
      let w=img.width,h=img.height;
      const max=16383;
      if(w>max||h>max){const r=Math.min(max/w,max/h);w=Math.round(w*r);h=Math.round(h*r);}
      canvas.width=w;canvas.height=h;
      const ctx=canvas.getContext('2d');
      if(format==='image/jpeg'){ctx.fillStyle='#FFF';ctx.fillRect(0,0,w,h);}
      ctx.drawImage(img,0,0,w,h);
      canvas.toBlob(b=>{b?res(b):rej(new Error('Browser cannot create '+format));},format,quality);
    };
    img.onerror=()=>rej(new Error('Cannot load image'));
    img.src=URL.createObjectURL(file);
  });
}
