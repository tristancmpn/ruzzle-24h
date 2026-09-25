"""Construit words.txt : tous les mots acceptes, les mots courants suffixes par '*'.

Sources :
  - liste de formes : https://www.pallier.org/extra/liste.de.mots.francais.frgut.txt
  - frequences     : Lexique 3.83, http://www.lexique.org/databases/Lexique383/Lexique383.tsv

Usage : python3 tools/build_dict.py liste.txt Lexique383.tsv > words.txt

Regles :
  - accents retires (comme Ruzzle), noms propres exclus, 2 a 16 lettres a-z, au moins une voyelle ;
  - faux mots (abreviations...) retires, voir FAUX ;
  - mot courant : present dans Lexique avec un lemme frequent (>= SEUIL occurrences par million),
    ou conjugaison d'un verbe frequent absente de Lexique (ex. armerai -> armer) ;
  - les autres mots restent acceptes comme mots bonus.
"""
import csv
import re
import sys
import unicodedata

SEUIL = 1.0

FAUX = set("dep div eme fig men mut nif nifs ree rees rhe rhes zee zees neo etc ref janv".split())

# Terminaisons ajoutees a l'infinitif (futur, conditionnel) et au radical des verbes en -er
FUTUR = "ai as a ons ez ont ais ait ions iez aient".split()
ER = "a as ai ames ates erent asse asses at assions assiez assent e es ent ons ez ais ait ions iez aient ee ees es".split()


def norm(w):
    w = w.replace("œ", "oe").replace("æ", "ae")
    return "".join(c for c in unicodedata.normalize("NFD", w) if unicodedata.category(c) != "Mn")


words = set()
for line in open(sys.argv[1], encoding="utf-8"):
    w = line.strip()
    if not w or w[0].isupper():
        continue
    n = norm(w)
    if re.fullmatch(r"[a-z]{2,16}", n) and re.search("[aeiouy]", n) and n not in FAUX:
        words.add(n)

lex = {}  # forme -> frequence max du lemme
verbs = {}  # infinitif -> frequence du lemme
for r in csv.DictReader(open(sys.argv[2], encoding="utf-8"), delimiter="\t"):
    f = max(float(r["freqlemfilms2"] or 0), float(r["freqlemlivres"] or 0))
    n = norm(r["ortho"].lower())
    lex[n] = max(lex.get(n, 0), f)
    if r["cgram"] == "VER":
        lem = norm(r["lemme"].lower())
        verbs[lem] = max(verbs.get(lem, 0), f)


def verb_freq(w):
    best = 0
    for end in FUTUR:
        if w.endswith(end):
            base = w[: -len(end)] if end else w
            for inf in (base, base + "e"):  # finir-ai, prendr(e)-ai
                if inf.endswith(("er", "ir", "re")):
                    best = max(best, verbs.get(inf, 0))
    for end in ER:
        if w.endswith(end):
            best = max(best, verbs.get(w[: -len(end)] + "er", 0))
    return best


def common(w):
    if w in lex:
        return lex[w] >= SEUIL
    return len(w) >= 5 and verb_freq(w) >= SEUIL


sys.stdout.write("\n".join(w + ("*" if common(w) else "") for w in sorted(words)))
