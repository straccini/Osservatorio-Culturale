# Decisione: agenti tematici AG1–AG5 DISMESSI

*18/09/2026 — decisione delegata a Claude da Silvano ("decidi tu sugli agenti e procedi").*

## Contesto
I 5 agenti tematici (AG1 Bandi, AG2 Normativa, AG3 Innovazione, AG4 Comunità,
AG5 Digital) erano **sospesi dal 02/08/2026** (Fase 3): gli scanner `scanAgente*`
escono subito se `OC_AGENTI_ATTIVI` ≠ 'true', e le loro entry sono commentate
nella schedule di `SetupMaster.js`. La loro funzione — scovare fonti e contenuti —
è stata **sostituita dal sistema Scout fonti** (miner interno + ciclo settimanale +
Routine del lunedì), che è operativo.

## Perché dismettere invece di riattivare
- Il rimpiazzo (Scout) funziona; riattivare i 5 agenti significherebbe rimettere in
  moto scanner che **duplicherebbero** lo Scout.
- Lo stato "sospeso" era il peggiore: il report settimanale segnalava **"Sistema
  agenti FERMO (0/5)" in rosso (priorità alta)** come se fosse un guasto, e il
  digest del martedì eseguiva codice morto (`includeAgentContent`) per una sezione
  sempre vuota.

## Cosa è stato cambiato (v4.35, reversibile)
- `AgentSupervisore.js`: nuova costante `SAS_AGENTI_DISMESSI = true`. Con essa:
  - l'health score **non** penalizza più `0/5` agenti (non è un guasto, è una scelta);
  - la strategia settimanale **non** emette più l'allarme rosso "reinnestarlo o
    dismetterlo";
  - il report Telegram scrive *"Agenti: dismessi (sostituiti dallo Scout fonti)"*
    invece di *"0/5 attivi"*.
- `Digest_routing.js`: il digest profilati del martedì passa `includeAgentContent:false`
  (niente più tentativo di aggregare contenuti agenti inesistenti).

## Come riattivarli un domani (se mai servisse)
1. `SAS_AGENTI_DISMESSI = false` in `AgentSupervisore.js`;
2. proprietà script `OC_AGENTI_ATTIVI = 'true'`;
3. riabilitare le entry `scanAgente1..5` nella schedule di `SetupMaster.js`;
4. rimettere `includeAgentContent:true` nel digest del martedì.

Il codice degli agenti (`AgentConfig/Scanner/Routing/Digest/Setup`) resta in
repository intatto: la dismissione è una decisione operativa, non una cancellazione.
