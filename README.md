# Preselekcja perfum przez Jev

Skrypt Node.js wykorzystujacy `experimental_decide` z pakietu `ai` i model
`typesafe-ai/jev` przez Vercel AI Gateway.

## Uruchomienie

Wymagany Node.js >= 22.18.

```bash
pnpm install
cp .env.example .env
```

Jesli `AI_GATEWAY_API_KEY` jest juz globalnie wyeksportowany, nie tworz `.env`.
Komunikat `.env not found. Continuing without it.` jest wtedy nieszkodliwy.
W przeciwnym razie wpisz klucz do `.env` (nie publikuj go):

```dotenv
AI_GATEWAY_API_KEY=twoj_klucz
```

Najpierw bezplatny plan, bez wywolan AI i bez zapisu:

```bash
pnpm run plan
```

Mala proba na 20 najpopularniejszych kandydatach (platne wywolania):

```bash
pnpm run select --limit 20
```

Wariant `pnpm run select -- --limit 20` rowniez jest obslugiwany.

Pelna selekcja:

```bash
pnpm run select
```

Zmiana progu i lokalizacji:

```bash
pnpm run select --min-ratings 500 --source /sciezka/do/json --output ./wyniki
```

Domyslne zrodlo: `/Users/pawelkomarnicki/pro/normalizacja/perfumy_json`.
Odczyt jest **nierekurencyjny**, aby nie importowac ponownie kopii z podkatalogow.
Zrodla nie sa modyfikowane ani usuwane. Wyniki musza byc poza zrodlem.
Pliki wynikowe sa kopiami oryginalnych JSON-ow, bez mieszania danych odmian.

## Zasady selekcji

1. Walidacja JSON, marki, nazwy i liczby ocen. Bledy trafiaja do raportu.
2. Lokalny prog `ratingCount >= 200` (konfigurowalny); brak liczby ocen oznacza zero.
   To filtr popularnosci, nie dostepnosci. Nizsze wyniki pozostaja w zrodle.
3. Produkty potwierdzone jako niedostepne w opcjonalnej mapie dostepnosci sa pomijane.
4. Kandydaci sa przetwarzani od najwiekszej liczby ocen (nie sredniej oceny).
5. Dla kazdego kandydata Jev decyduje o przydatnosci do katalogu oraz przynaleznosci
   do juz wybranej rodziny tej samej marki. EDT, EDP, Parfum i flankery jednej linii
   maja miec jednego reprezentanta. Odrębne linie, np. Sauvage i Eau Sauvage,
   nie powinny byc laczone. Popularna nisza jest dozwolona.
6. Model dostaje do 20 najbardziej podobnych nazw wybranych reprezentantow marki.
   To ograniczenie kosztu/kontekstu: nietypowo nazwane flankery moga nie zostac
   skojarzone. Grupowanie jest decyzja AI i wymaga kontroli na probce.
7. Pewna odmienna linia jest kopiowana do `wybrane`. Pewny wariant juz wybranej
   linii jest pomijany z identyfikatorem popularniejszego reprezentanta w raporcie.
8. Niejednoznaczne odpowiedzi trafiaja do `do-weryfikacji`. Domyslny prog
   prawdopodobienstwa wynosi 0.8 (`--confidence`). To prog roboczy, nie gwarancja
   poprawnosci; nalezy go skalibrowac na recznie oznaczonej probce.

Odrzucenie przez AI wymaga niskiego prawdopodobienstwa przydatnosci
(`P <= 1 - confidence`); niepewnosc nie powoduje automatycznego odrzucenia.
Niepewna rodzina nie zostaje reprezentantem, aby nie propagowac bledu grupowania.

## Dostepnosc

W zrodle brak osobnego pola biezacej dostepnosci sklepowej. Skrypt nie ma dostepu
 do ofert sklepow; pamiec modelu, wiek zapachu i liczba ocen nie potwierdzaja stanu magazynowego.
Nieznana dostepnosc **nie oznacza** niedostepnosci. Mozesz dostarczyc mape:

```json
{
  "przykladowy_plik.json": {
    "status": "unavailable",
    "source": "reczna weryfikacja ofert na rynku PL",
    "checkedAt": "2026-11-04"
  }
}
```

Dozwolone statusy: `available`, `unavailable`, `unknown`. Dwa pierwsze wymagaja
`source` i `checkedAt`. Mapa jest autorytatywna dla danego przebiegu; skrypt nie
odswieza jej automatycznie, wiec przed kolejnymi przebiegami zweryfikuj daty.

```bash
pnpm run select --availability ./dostepnosc.json
```

## Wyniki

```text
wyniki/
  cache/                         # odpowiedzi AI pod hashem wejscia i polityki
  DATA-PID/
    wybrane/                     # kopie wybranych JSON-ow
    do-weryfikacji/               # kopie niejednoznacznych kandydatow
    raporty/
      plan.json
      decyzje.jsonl              # decyzja dla kazdego pliku, takze odrzuconego
      wybrane.jsonl              # lista wybranych: nazwa, oceny, dostepnosc, decyzja
      podsumowanie.json
      blad.json                  # tylko po przerwaniu z powodu bledu
```

Nazwy wybranych perfum sa tez wypisywane na terminal wraz z liczba ocen.
Kazdy przebieg zapisuje osobny katalog. Wspolny cache pozwala wznowic przerwany
przebieg przez ponowienie identycznej komendy: poprawne poprzednie decyzje nie
wymagaja ponownych wywolan. Zmiana danych, kontekstu rodziny, progu lub polityki
uniewaznia odpowiedni wpis cache. Bledy dostawcy przerywaja wykonanie zamiast
masowo odrzucac produkty. Ograniczony przebieg oznacza pozostale pozycje jako
`pending`, a podsumowanie jako `complete: false`.

## Koszt i prywatnosc

Maksymalnie jedno logiczne wywolanie na kandydata powyzej progu; SDK moze ponowic
nieudane zadanie do 2 razy. Timeout wynosi 60 sekund na probe; po przekroczeniu skrypt
ponawia wywolanie, lacznie do 3 prob, i dopiero wtedy przerywa przebieg. Przerwane proby
moga zostac policzone przez dostawce. Najpierw sprawdz `maxModelCalls`
w planie i wykonaj mala probe. Limit dotyczy liczby kandydatow, nie tokenow ani
kwoty w USD. Skrypt przesyla do AI Gateway nazwe, marke, liczbe ocen, skrocony opis
(do 3000 znakow), podobnych reprezentantow oraz opcjonalne dane dostepnosci.
Nie wysyla pelnych recenzji ani calego JSON-a.

## Katalog asystenta

```bash
pnpm run catalog
```

Buduje katalog z kopii opisanej w `dane/snapshot.json`, bez wywolan AI.
Sprawdza hash kopii, a nuty mapuje przez `dane/nuty.json`. Wynik trafia do
`wyniki/katalog/<id>/`: `katalog.json`, `odniesienia.json` i `raport.json`.

## Testy

```bash
pnpm test
```

Testy sa deterministyczne: uzywaja atrap decyzji, nie wymagaja klucza ani platnych
wywolan. Test pelnego przebiegu kopiuje wylacznie pliki testowe w katalogu tymczasowym.

Dokumentacja:
- https://vercel.com/ai-gateway/models/jev
- https://ai-sdk.dev/docs/ai-sdk-core/decisions
