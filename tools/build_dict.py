"""Construit words.txt a partir d'une liste de mots francais (une forme par ligne).

Source utilisee : https://www.pallier.org/extra/liste.de.mots.francais.frgut.txt
Usage : python3 tools/build_dict.py liste.txt > words.txt

Regles : accents retires (comme Ruzzle), noms propres exclus,
2 a 16 lettres a-z, au moins une voyelle (elimine cm, kg...).
"""
import re
import sys
import unicodedata


def norm(w):
    w = w.replace("œ", "oe").replace("æ", "ae")
    return "".join(c for c in unicodedata.normalize("NFD", w) if unicodedata.category(c) != "Mn")


words = set()
for line in open(sys.argv[1], encoding="utf-8"):
    w = line.strip()
    if not w or w[0].isupper():
        continue
    n = norm(w)
    if re.fullmatch(r"[a-z]{2,16}", n) and re.search("[aeiouy]", n):
        words.add(n)

sys.stdout.write("\n".join(sorted(words)))
