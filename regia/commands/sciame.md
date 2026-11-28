---
description: "Sciame REGIA: pianifica, lancia fino a 3 agenti in worktree separati, verifica, unisce in ordine e fa il report"
argument-hint: "<obiettivo>"
allowed-tools: Bash(node:*), Bash(git:*), Bash(npm:*), Bash(npx:*), Read, Grep, Glob, Agent, Task
---
Obiettivo dello sciame: $ARGUMENTS

Segui questi passi, in ordine, senza saltarne. Le regole assolute di REGIA valgono per tutti gli agenti (niente mail, pagamenti, segreti, push su main).

1. **Piano.** Delega al subagent `pianificatore` l'obiettivo qui sopra. Ti deve restituire la tabella e il blocco JSON `{"complessita", "sotto_task": [...]}`.
2. **Rifiuto dei task piccoli.** Se `complessita` è 1 o 2: NON creare worktree e NON lanciare agenti. Rispondi solo: "Task piccolo (complessità N/5): fallo con un agente solo, per esempio <agente più adatto>. /sciame non parte." e fermati.
3. **Mostra il piano** in tabella (sotto-task, agente, file, criterio, reversibile). Massimo 3 sotto-task: se sono di più, unisci i più piccoli. Se tutti sono reversibili procedi senza chiedere. Se anche uno solo non è reversibile, chiedi conferma a l'utente e aspetta.
4. **Worktree.** Scegli un nome breve per lo sciame (es. `seo-bug-1430`) e crea un worktree per sotto-task:
   `node "{{REGIA}}/bin/worktree.mjs" crea <nome> <id1> <id2> <id3> --agenti <a1>,<a2>,<a3> --titoli "<t1>|<t2>|<t3>"`
   Leggi dal JSON stampato percorso e ramo di ogni sotto-task. Se il comando fallisce (modifiche non committate, troppi task), riporta l'errore e fermati.
5. **Lavoro in parallelo.** Nello STESSO messaggio lancia un subagent per sotto-task (l'agente del piano), in primo piano (`run_in_background: false`): girano in parallelo e possono chiedere i permessi. A ognuno passa: percorso assoluto del worktree, ramo, file previsti, criterio di accettazione, e questa istruzione: "Lavora solo dentro <percorso>, con percorsi assoluti. Per git usa `git -C <percorso> ...`, per i test `npm --prefix <percorso> test` (niente `cd`). Fai commit sul ramo <ramo>. Se Bash ti viene negato, scrivi comunque i file e dillo: il commit lo fa chi coordina. Chiudi con la riga ESITO."
   Se un agente non ha potuto fare commit, fallo tu: `git -C <percorso> add <file> && git -C <percorso> commit -m "<cosa e perché>"`.
6. **Verifica.** Per ogni ramo, in parallelo e in primo piano, delega al `tester` (test nel worktree con `npm --prefix <percorso> test`, numeri veri) e poi al `revisore` (diff `<baseCommit>..<ramo>`, il baseCommit è nello stato: `node "{{REGIA}}/bin/worktree.mjs" stato <nome>`). Se i test falliscono o il revisore dice "da rifare", rimanda una sola volta all'agente del sotto-task con l'elenco dei problemi, poi riverifica.
   Registra ogni esito: `node "{{REGIA}}/bin/worktree.mjs" esito <nome> <id> esito=<completato|parziale|fallito> test="<passati>/<totali>" agente=<agente>`
7. **Merge ordinato.** `node "{{REGIA}}/bin/worktree.mjs" unisci <nome> <id nell'ordine del piano>`. I sotto-task falliti vengono saltati. Al primo conflitto il merge si ferma: riportalo e non forzare nulla.
8. **Test finali** sul ramo di lavoro con il comando di test del progetto.
9. **Report e pulizia.** Mostra l'output di `node "{{REGIA}}/bin/worktree.mjs" report <nome>`, poi esegui `node "{{REGIA}}/bin/worktree.mjs" pulisci <nome>`.
10. **Chiusura.** Al massimo 5 righe sotto la tabella: test finali (numeri), cosa resta da fare, prossimo passo (PR dal ramo di lavoro: mai push diretto su main).
