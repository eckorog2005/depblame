#!/bin/bash
# Usage: run.sh <spikeDir> <name> <groups>
S=$1; NAME=$2; SEL=$3; T=$S/trials/$NAME
mkdir -p $S/trials
node $S/scripts/splice.js $S/data make $T "$SEL" > $S/trials/$NAME.make.json || exit 1
before=$(shasum -a 256 $T/package-lock.json $T/package.json)
( cd $T && npm ci --ignore-scripts --no-audit --no-fund --loglevel=error ) > $S/trials/$NAME.npm.log 2>&1; rc=$?
after=$(shasum -a 256 $T/package-lock.json $T/package.json)
[ "$before" = "$after" ] && rewrite=no || rewrite=YES
echo "== $NAME groups=[$SEL] npm_ci_rc=$rc lock_or_pkg_rewritten=$rewrite"
[ -f $S/trials/baseline.json ] || cp $S/trials/$NAME.make.json $S/trials/baseline.json
node -e 'const b=new Set(require(process.argv[2]).problems);const n=require(process.argv[1]).problems.filter(p=>!b.has(p));console.log("new splice problems:", n.length, JSON.stringify(n.slice(0,8),null,1))' $S/trials/$NAME.make.json $S/trials/baseline.json
if [ $rc -eq 0 ]; then node $S/scripts/splice.js $S/data verify $T; else tail -15 $S/trials/$NAME.npm.log; fi
