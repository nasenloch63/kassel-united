const dialog=document.getElementById('lightbox');const links=[...document.querySelectorAll('[data-photo]')];let current=0,opener=null;const img=document.getElementById('viewer-image'),caption=document.getElementById('viewer-caption'),count=document.getElementById('viewer-count');function show(i){current=(i+links.length)%links.length;const a=links[current];img.src=a.href;img.alt=a.querySelector('img').alt;caption.textContent=img.alt;count.textContent=(current+1)+' / '+links.length;}links.forEach((a,i)=>a.addEventListener('click',e=>{if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();opener=a;show(i);dialog.showModal();document.body.classList.add('scroll-locked');document.getElementById('viewer-close').focus();}));document.getElementById('viewer-close').onclick=()=>dialog.close();document.getElementById('viewer-prev').onclick=()=>show(current-1);document.getElementById('viewer-next').onclick=()=>show(current+1);dialog.addEventListener('close',()=>{document.body.classList.remove('scroll-locked');if(opener)opener.focus();});dialog.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'){e.preventDefault();show(current-1);}if(e.key==='ArrowRight'){e.preventDefault();show(current+1);}});

// Native controls remain available without JavaScript. Play only one clip at a time.
const videos = [...document.querySelectorAll('.media-card video')];
videos.forEach(video => {
  video.addEventListener('play', () => videos.forEach(other => { if (other !== video) other.pause(); }));
  video.addEventListener('error', () => {
    if (video.parentElement.querySelector('.media-status')) return;
    const message = document.createElement('p');
    message.className = 'media-status';
    message.setAttribute('role', 'status');
    message.textContent = 'Das Video konnte nicht geladen werden. Versuche es über „Video separat öffnen“.';
    video.after(message);
  });
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) videos.forEach(video => video.pause());
});
