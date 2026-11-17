document.querySelectorAll('[data-registration]').forEach(form=>{
 form.addEventListener('submit',async event=>{
 event.preventDefault();if(!form.reportValidity())return;
 const status=form.querySelector('[role=status]'),button=form.querySelector('[type=submit]');
 const body=Object.fromEntries(new FormData(form));body.kind=form.dataset.registration;body.privacy=form.elements.privacy.checked;body.whatsapp=form.elements.whatsapp?.checked||false;
 if(body.kind==='run'&&!body.email.trim()&&!body.instagram.trim()){status.textContent='Bitte E-Mail oder Instagram angeben.';form.elements.email.focus();return;}
 button.disabled=true;status.textContent='Anmeldung wird gespeichert …';
 try{const response=await fetch('/api/registration?action=register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw Error(data.error);form.reset();status.textContent=body.kind==='run'?'Du bist angemeldet! Wir sehen uns am 22. November um 14:30 Uhr an der Orangerie.':'Anmeldung gespeichert! Wir melden uns zur Abstimmung bei dir.';}catch(e){status.textContent=e.message||'Anmeldung fehlgeschlagen. Bitte erneut versuchen.';}finally{button.disabled=false;}
 });
});
