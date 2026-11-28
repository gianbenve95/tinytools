#!/usr/bin/env bash
# REGIA: prova su un progetto in un comando.
# Controlla Node, Claude Code, login e abbonamento, Ollama, git; poi crea il ramo
# prova/regia e installa REGIA nel progetto. Non fa commit, non fa push, non tocca main.
# Uso: ~/tinytools/regia/prova.sh ~/Progetti/mio-sito
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
P="${1:-}"
RAMO="prova/regia"
STOP=0

ok()   { printf '  %-22s ok    %s\n' "$1" "$2"; }
warn() { printf '  %-22s !!    %s\n' "$1" "$2"; }
no()   { printf '  %-22s NO    %s\n' "$1" "$2"; STOP=1; }

if [ -z "$P" ]; then
  echo "Uso: $0 <cartella del progetto>   (es. $0 ~/Progetti/mio-sito)"
  exit 1
fi
if ! cd "$P" 2>/dev/null; then echo "Cartella non trovata: $P"; exit 1; fi
P="$(pwd)"

echo "REGIA, controlli prima della prova su $P"
echo

# 1. Node
if command -v node >/dev/null 2>&1; then
  NV="$(node -p 'process.versions.node')"
  if [ "${NV%%.*}" -ge 20 ]; then ok "Node" "$NV"; else no "Node" "$NV: serve 20 o superiore (brew upgrade node)"; fi
else
  no "Node" "non trovato: brew install node"
fi

# 2. Claude Code: version, login, subscription instead of paid API
if command -v claude >/dev/null 2>&1; then
  CV="$(claude --version 2>/dev/null | sed -E 's/^([0-9.]+).*/\1/')"
  if node -e 'const [a,b,c]=process.argv[1].split(".").map(Number); process.exit(a>2||(a===2&&(b>1||(b===1&&c>=283)))?0:1)' "$CV" 2>/dev/null; then
    ok "Claude Code" "$CV (consigliato aggiornare ogni tanto: claude update)"
  else
    warn "Claude Code" "$CV: più vecchia di quelle provate (2.1.283, 2.1.329). Esegui: claude update"
  fi
  AUTH="$(claude auth status --json 2>/dev/null || echo '{}')"
  STATO="$(printf '%s' "$AUTH" | node -e '
    let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
      let a={};try{a=JSON.parse(s)}catch{}
      const exp=a.loginExpiresAt?Date.parse(a.loginExpiresAt):null;
      if(!a.loggedIn||(exp&&exp<Date.now())){console.log("login|Login assente o scaduto: apri claude, scrivi /login e scegli il tuo account Claude con abbonamento (Pro o Max), NON la Console API");return}
      if(a.apiProvider&&a.apiProvider!=="firstParty"){console.log("cloud|Provider "+a.apiProvider+": i consumi vanno su un cloud a pagamento");return}
      const m=String(a.authMethod||"");
      if(m==="claude.ai"&&!a.subscriptionType){console.log("login|Login claude.ai senza abbonamento rilevato: controlla di avere Pro o Max (/status in Claude Code)");return}
      if(!/^oauth/i.test(m)&&m!=="claude.ai"){console.log("api|Metodo "+(m||"sconosciuto")+": probabile credito API a pagamento. Fai /logout e poi /login con il tuo account con abbonamento");return}
      console.log("ok|abbonamento ("+a.authMethod+")")})')"
  case "$STATO" in
    ok\|*) ok "Login" "${STATO#ok|}" ;;
    login\|*) warn "Login" "${STATO#login|}" ;;
    *) no "Fatturazione" "${STATO#*|}" ;;
  esac
else
  no "Claude Code" "CLI claude non trovata"
fi
for K in ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN; do
  if [ -n "$(printenv "$K" 2>/dev/null)" ]; then no "Fatturazione" "$K è impostata: Claude Code userebbe credito API a pagamento. Toglila da ~/.zshrc e riapri il terminale"; fi
done

# 3. Ollama (optional): one or more hosts, comma separated (e.g. the Macs of a cluster)
OURLS="${REGIA_OLLAMA_URL:-http://localhost:11434}"
TUTTI=""
OLDIFS="$IFS"; IFS=','
for OURL in $OURLS; do
  IFS="$OLDIFS"
  OURL="$(printf '%s' "$OURL" | tr -d ' ')"
  [ -z "$OURL" ] && continue
  TAGS="$(curl -s --max-time 2 "$OURL/api/tags" 2>/dev/null || true)"
  if [ -n "$TAGS" ]; then
    MODELLI="$(printf '%s' "$TAGS" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).models.map(m=>m.name).join(", "))}catch{console.log("")}})')"
    ok "Ollama" "$OURL: ${MODELLI:-nessun modello}"
    TUTTI="$TUTTI $MODELLI"
  else
    warn "Ollama" "non risponde su $OURL: REGIA funziona lo stesso, senza delega a Qwen da qui"
  fi
done
IFS="$OLDIFS"
if [ -n "$TUTTI" ]; then
  case "$TUTTI" in *qwen*) ;; *) warn "Qwen" "nessun modello qwen: ollama pull qwen2.5:7b (gratis, circa 4,7 GB)";; esac
  case "$TUTTI" in *embed*|*bge*|*minilm*) ;; *) warn "Embedding" "facoltativo, per la memoria semantica: ollama pull nomic-embed-text";; esac
fi

# 4. Project
if [ "$P" = "$HOME" ] || [ "$P" = "/" ]; then no "Cartella" "è la home, non un progetto"; fi
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  RAMO_ORA="$(git branch --show-current)"
  ok "Git" "ramo attuale: ${RAMO_ORA:-detached}"
  if [ -n "$(git status --porcelain --untracked-files=no)" ]; then warn "Modifiche" "ci sono modifiche non committate: restano dove sono, sul ramo $RAMO"; fi
else
  no "Git" "la cartella non è un repository git"
fi

echo
if [ "$STOP" = 1 ]; then
  echo "Mi fermo: sistema le righe NO e rilancia. Nessuna modifica fatta."
  exit 1
fi

# 5. Dedicated branch, then install
if [ "$(git branch --show-current)" != "$RAMO" ]; then
  if git show-ref --verify --quiet "refs/heads/$RAMO"; then git switch -q "$RAMO"; else git switch -q -c "$RAMO"; fi
fi
echo "Ramo: $(git branch --show-current)"
echo
"$HERE/install.sh" --project "$P" || exit 1

cat <<EOF

Prossimi passi (uno per riga, senza commenti):

  cd "$P"
  claude

Dentro Claude Code:
  /login        solo se lo chiede: scegli l'account Claude con abbonamento
  /regia-test   deve dare tutto ok (Qwen "n/d" se Ollama è spento)

Per togliere tutto:  $HERE/uninstall.sh "$P"
Per tornare al ramo di prima:  git -C "$P" switch ${RAMO_ORA:-main}
EOF
