const fileInput=document.getElementById('fileInput');
const selectBtn=document.getElementById('selectBtn');
const preview=document.getElementById('preview');
const previewSection=document.getElementById('previewSection');

const fileInfo=document.getElementById('fileInfo');
const webpInfo=document.getElementById('webpInfo');
const savedInfo=document.getElementById('savedInfo');

const convertBtn=document.getElementById('convertBtn');
const downloadBtn=document.getElementById('downloadBtn');

let currentFile=null;

selectBtn.onclick=()=>fileInput.click();

fileInput.onchange=e=>{
const f=e.target.files[0];
if(!f) return;

if(f.size>8*1024*1024){
alert('File must be under 8MB');
return;
}

currentFile=f;
preview.src=URL.createObjectURL(f);

fileInfo.textContent=`Original: ${(f.size/1024/1024).toFixed(2)} MB`;

webpInfo.classList.add('hidden');
savedInfo.classList.add('hidden');
downloadBtn.classList.add('hidden');

previewSection.classList.remove('hidden');
};

convertBtn.onclick=()=>{
const img=new Image();

img.onload=()=>{
const canvas=document.createElement('canvas');
canvas.width=img.width;
canvas.height=img.height;

canvas.getContext('2d').drawImage(img,0,0);

canvas.toBlob(blob=>{
const webpSize=blob.size;
const orig=currentFile.size;

webpInfo.textContent=`WebP: ${(webpSize/1024/1024).toFixed(2)} MB`;
savedInfo.textContent=`Saved: ${(((orig-webpSize)/orig)*100).toFixed(1)}%`;

webpInfo.classList.remove('hidden');
savedInfo.classList.remove('hidden');

downloadBtn.href=URL.createObjectURL(blob);
downloadBtn.classList.remove('hidden');

convertBtn.style.display='none';

},"image/webp",0.85);
};

img.src=URL.createObjectURL(currentFile);
};