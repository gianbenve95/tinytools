# Uso di REGIA

## Prima volta su un progetto

1. Una volta sola: Claude Code sull'abbonamento. Se vedi "API Usage Billing" o "Login expired", dentro Claude Code scrivi `/login` e scegli il tuo account Claude con abbonamento (Pro o Max), non la Console API.
2. Aggiorna Claude Code:

```bash
claude update
```

3. Controlli, ramo dedicato e installazione:

```bash
~/tinytools/regia/prova.sh ~/Progetti/mio-sito
```

Lo script si ferma senza toccare nulla se manca qualcosa (Node, git, login) o se trova una chiave API a pagamento. Dice anche se Ollama risponde e quali modelli ha.

4. Apri Claude Code nel progetto:

```bash
cd ~/Progetti/mio-sito
claude
```

5. Dentro Claude Code:
   - `/regia-test`: deve dare tutto ok (Qwen "n/d" se Ollama è spento: va bene);
   - `/agents`: devono comparire gli 11 agenti di REGIA;
   - `/mcp`: `regia-memory` e `regia-local` connessi. Se Claude Code chiede di approvare i server del progetto, approvali.

Attenzione: `claude` va lanciato dentro la cartella del progetto, non dalla home.

## Ogni giorno

| Vuoi | Scrivi |
|---|---|
| Un lavoro normale | Scrivi come sempre. Il router suggerisce l'agente in una riga, tu ignori o segui |
| Un agente preciso | "usa il seo-tecnico sulle pagine prodotto" |
| Tre lavori in parallelo | `/sciame correggi il bug del carrello, aggiungi i meta a chi-siamo, scrivi i test del totale` |
| Ricordare una scelta | `/memoria salva decisione le pagine prodotto restano SSG, niente SSR` |
| Ritrovarla | `/memoria cerca SSG` |
| Vedere chi consuma | `/costi` |
| Capire cosa sta succedendo | `/stato` |

## Quando il guard chiede

Il guard chiede (non blocca) per: mail, pagamenti, acquisti, servizi a consumo, push diretto su main, cancellazioni fuori dal progetto, installazioni globali.
Se l'azione è voluta, rispondi sì al prompt di Claude Code: quello è il consenso esplicito.
Blocca senza chiedere: `rm -rf` su `/`, `~` o cartelle di sistema, push forzato su main, stampa o invio di segreti, `curl | sh` da domini non in lista, chiavi scritte nei file.
Il motivo è sempre in italiano e resta in `~/.regia/data/guard.jsonl`.

## Qwen su un altro computer in LAN

```bash
export REGIA_OLLAMA_URL=http://192.168.1.20:11434   # l indirizzo del computer remoto
```
oppure `ollama.url` in `.claude/regia/config/regia.json`. Sul computer remoto Ollama deve ascoltare in rete (`OLLAMA_HOST=0.0.0.0`).
Modelli consigliati: uno di chat (es. `qwen2.5:7b`) e, per la memoria semantica, `nomic-embed-text`. REGIA li rileva da sola.

## Sciame: cosa aspettarsi

1. Tabella del piano. Se tutto è reversibile parte da solo; altrimenti ti chiede.
2. Tre agenti lavorano in parallelo in `~/.regia/worktrees/...`.
3. Tester e revisore su ogni ramo.
4. Merge in ordine sul ramo di lavoro (se eri su main: `regia/<nome>-lavoro`).
5. Tabella finale e prossimo passo: PR. Mai push su main.

Senza nessuno davanti (`claude -p`, script), i permessi vanno dati prima:

```bash
claude -p "/sciame <obiettivo>" --permission-mode acceptEdits \
  --allowedTools "Bash(node:*) Bash(git:*) Bash(npm:*) Bash(npx:*) Read Edit Write Grep Glob Agent mcp__regia-memory mcp__regia-local"
```

Se lo sciame dice "Task piccolo": è voluto. Per una o due modifiche un agente solo costa meno ed è più veloce.

## Problemi comuni

| Sintomo | Soluzione |
|---|---|
| I comandi `/sciame` ecc. non compaiono | Riapri Claude Code nella cartella del progetto |
| `regia-memory` non connesso | `/mcp` e approva i server del progetto; oppure `/regia-test` per il dettaglio |
| "modifiche non committate" allo sciame | `git commit` o `git stash`, poi rilancia |
| Avviso di soglia dei token | Solo un avviso: valuta `/compact` o una sessione nuova |
| Vuoi togliere tutto | `~/tinytools/regia/uninstall.sh` dal progetto |
