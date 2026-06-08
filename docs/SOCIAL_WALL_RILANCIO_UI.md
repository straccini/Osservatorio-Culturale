# Social Wall — snippet UI "Rilancio manuale" (da integrare in Index.html)

Il **backend è già attivo e deployato** (`SocialWall_v1.js`: `rilancioPreview(url)`, `rilanciaPost(body)`, `getRilanciList`, `deleteRilancio`, `toggleRilancio`; i post curati entrano nel wall via `fetchAndCacheSocialWall`).
Manca solo l'UI. Qui sotto lo snippet pronto. Va inserito da chi ha Index.html "in mano" (per evitare conflitti) e testato in incognito da admin.

> ⚠️ Index.html è dentro un grande IIFE: le nuove funzioni vanno definite **dentro** lo stesso IIFE e poi esposte su `OC` accanto alle altre (`OC.loadSocialWall = loadSocialWall;` ecc.), altrimenti gli `onclick="OC.xxx()"` danno ReferenceError.

## 1) HTML — dentro `#page-social`, subito dopo `</div>` della `page-head` (≈ riga 652), prima di `#socialWallList`
```html
<!-- Rilancio manuale (solo admin/editor) -->
<div id="swRilancioBox" style="display:none;border:1px solid var(--line,#e7e0d4);border-radius:10px;padding:12px;margin:10px 0;background:var(--paper-2,#f7f4ee)">
  <div style="font-weight:600;font-size:13px;margin-bottom:8px">Rilancia un post nel wall</div>
  <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
    <input id="swrUrl" type="url" placeholder="URL del post (X, LinkedIn, Instagram, articolo…)" style="flex:1;min-width:240px;padding:7px 10px;font-size:13px;border:1px solid var(--line,#ddd);border-radius:6px">
    <button class="btn btn-secondary" onclick="OC.rilancioPreview()" style="font-size:12px;padding:7px 12px">Anteprima</button>
  </div>
  <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
    <input id="swrAutore" placeholder="Autore / testata" style="flex:1;min-width:160px;padding:7px 10px;font-size:13px;border:1px solid var(--line,#ddd);border-radius:6px">
    <select id="swrTipo" style="padding:7px 10px;font-size:13px;border:1px solid var(--line,#ddd);border-radius:6px">
      <option value="persona">persona</option><option value="testata">testata</option><option value="sinopia">sinopia</option>
    </select>
    <input id="swrPiattaforma" placeholder="piattaforma (X, LinkedIn…)" style="width:160px;padding:7px 10px;font-size:13px;border:1px solid var(--line,#ddd);border-radius:6px">
  </div>
  <input id="swrTitolo" placeholder="Titolo" style="width:100%;margin-top:6px;padding:7px 10px;font-size:13px;border:1px solid var(--line,#ddd);border-radius:6px">
  <textarea id="swrEstratto" placeholder="Estratto (max 300 caratteri)" rows="2" style="width:100%;margin-top:6px;padding:7px 10px;font-size:13px;border:1px solid var(--line,#ddd);border-radius:6px"></textarea>
  <input id="swrImg" placeholder="URL immagine (opzionale)" style="width:100%;margin-top:6px;padding:7px 10px;font-size:13px;border:1px solid var(--line,#ddd);border-radius:6px">
  <div style="margin-top:8px;display:flex;gap:8px;align-items:center">
    <button class="btn" onclick="OC.rilanciaPost()" style="font-size:12px;padding:7px 14px">Pubblica nel wall</button>
    <span id="swrMsg" style="font-size:12px;color:var(--ink-2)"></span>
  </div>
</div>
```

## 2) JS — dentro l'IIFE, vicino a `loadSocialWall` (≈ riga 2826)
```javascript
function _swToken_() { return (window.OC_SESSION && window.OC_SESSION.token) || null; }
function _swIsEditor_() { var l = (window.OC_SESSION && window.OC_SESSION.livello) || 0; return l >= 2; }

function swRilancioInit() { var box = $('swRilancioBox'); if (box) box.style.display = _swIsEditor_() ? 'block' : 'none'; }

function rilancioPreview() {
  var url = ($('swrUrl') || {}).value || ''; if (!url) { alert('Incolla un URL'); return; }
  var msg = $('swrMsg'); if (msg) msg.textContent = 'Anteprima in corso…';
  google.script.run.withSuccessHandler(function(r) {
    if (r && r.ok && r.og) {
      if ($('swrTitolo') && r.og.titolo)   $('swrTitolo').value = r.og.titolo;
      if ($('swrEstratto') && r.og.estratto) $('swrEstratto').value = (r.og.estratto || '').substring(0, 300);
      if ($('swrImg') && r.og.imgUrl)       $('swrImg').value = r.og.imgUrl;
      if (msg) msg.textContent = 'Anteprima caricata — controlla e pubblica.';
    } else { if (msg) msg.textContent = (r && r.error) || 'Nessuna anteprima (compila a mano).'; }
  }).withFailureHandler(function(e) { if (msg) msg.textContent = 'Errore anteprima: ' + (e.message || e); })
    .rilancioPreview(url);
}

function rilanciaPost() {
  var body = {
    url: ($('swrUrl') || {}).value || '', autore: ($('swrAutore') || {}).value || '',
    tipo: ($('swrTipo') || {}).value || 'persona', piattaforma: ($('swrPiattaforma') || {}).value || '',
    titolo: ($('swrTitolo') || {}).value || '', estratto: ($('swrEstratto') || {}).value || '',
    imgUrl: ($('swrImg') || {}).value || '', token: _swToken_()
  };
  if (!body.url && !body.titolo) { alert('Serve almeno URL o titolo'); return; }
  var msg = $('swrMsg'); if (msg) msg.textContent = 'Pubblico…';
  google.script.run.withSuccessHandler(function(r) {
    if (r && r.ok) { if (msg) msg.textContent = 'Pubblicato ✓';
      ['swrUrl','swrAutore','swrPiattaforma','swrTitolo','swrEstratto','swrImg'].forEach(function(id){ if($(id)) $(id).value=''; });
      loadSocialWall(true);
    } else { if (msg) msg.textContent = (r && r.error) || 'Errore pubblicazione.'; }
  }).withFailureHandler(function(e) { if (msg) msg.textContent = 'Errore: ' + (e.message || e); })
    .rilanciaPost(body);
}
```
> Nota: `rilanciaPost`/`rilancioPreview` lato backend richiedono editor/admin via `getCurrentUser_v44()`; passiamo anche il `token` per il deploy "Chiunque".

## 3) Esposizione su `OC` — dove sono registrati gli altri metodi (es. `OC.loadSocialWall = loadSocialWall;`)
```javascript
OC.rilancioPreview = rilancioPreview;
OC.rilanciaPost   = rilanciaPost;
```

## 4) Mostrare il box e migliorare l'etichetta `persona`
- In `loadSocialWall` (o all'apertura della pagina social) chiamare `swRilancioInit();` così il box compare solo per editor/admin.
- (Opzionale) aggiungere ai map di `renderSocialWall` la categoria persona:
  `_SW_LABELS.persona = 'Persone'; _SW_COLORS.persona = 'var(--amb-1)'; _SW_ORDER.unshift('persona');`

## 5) Test (incognito, da admin)
1. `sync-oc-to-gas.ps1` → deploy.
2. Apri la pagina **Social Wall**: vedi il box "Rilancia un post".
3. Incolla un URL → **Anteprima** (precompila) → ritocca → **Pubblica** → il post appare nel wall.
4. Per gestire/eliminare: `getRilanciList` / `deleteRilancio(id)` (foglio `SocialWallPost`).
