# Design interfejsu — asystent perfumowy

> Propozycja kierunku dla etapu „czat i UI” z `PLAN-ASYSTENTA-AI.md`. Dokument opisuje projekt do wdrożenia, nie istniejący interfejs. Nazwa produktu pozostaje do ustalenia.

## 1. Idea: atelier zapachu

Nie sklep internetowy i nie kolejny panel AI. Kameralna konsultacja z doradcą, który pomaga nazwać preferencje i proponuje kilka zapachów do sprawdzenia na skórze.

Kierunek wizualny: współczesna redakcja magazynu o perfumach. Papierowa biel, atramentowy tekst, ciemna zieleń, duża typografia szeryfowa i cienkie linie. Dużo oddechu, ale krótka droga od pytania do rekomendacji.

Element rozpoznawczy: **„Twój kierunek” — edytowalny pasek preferencji**, który zmienia się wraz z rozmową. Użytkownik widzi nie tylko wynik, ale też to, jak doradca zrozumiał jego potrzeby.

### Hierarchia doświadczenia

1. Opisz, czego szukasz, własnymi słowami.
2. W razie potrzeby odpowiedz na jedno krótkie pytanie.
3. Obejrzyj maksymalnie trzy propozycje: dlaczego pasują i jaki jest kompromis.
4. Doprecyzuj, porównaj albo sprawdź szczegóły.
5. Przetestuj próbkę przed zakupem.

Bez quizu na wejściu, ocen procentowych dopasowania, presji zakupowej i eksponowania technologii modelu.

## 2. Zakres i zgodność z projektem

- MVP jest zamkniętym testem, z ekranem wspólnego hasła przed wejściem do rozmowy.
- Projekt ma obecnie narzędzia Node.js, katalog i `src/engine.mjs`; nie ma jeszcze aplikacji webowej ani biblioteki komponentów.
- Planowany frontend: Next.js, AI SDK i Vercel AI Gateway. Ten dokument nie narzuca ich wersji ani nowej biblioteki UI.
- Dane produktów pochodzą z katalogu. Model zwraca walidowane bloki danych, nigdy dowolny HTML lub JSX.
- Stan preferencji należy do serwera. Sesja przeglądarki podtrzymuje rozmowę; nie obiecujemy historii między sesjami.
- Bez kont, koszyka, ofert sklepowych, cen w złotówkach i funkcji kupowania.
- PL i EN są równorzędne. Język interfejsu podąża za ostatnią wiadomością, z możliwością ręcznej zmiany.

## 3. Układ ekranów

### Wejście do zamkniętego testu

Prosty formularz: nazwa robocza produktu, informacja „Zamknięty test doradcy perfumowego”, pole „Hasło dostępu” i przycisk „Wejdź”. Widoczna etykieta pola, obsługa menedżera haseł i błędu bez kasowania wpisanej wartości.

### Początek rozmowy

Niewysoki nagłówek: nazwa robocza po lewej, przełącznik języka po prawej. Bez nawigacji sklepowej i rozbudowanego landing page’a.

Nad polem wiadomości:

> Znajdź zapach, który pasuje do Ciebie.
>
> Opowiedz, co lubisz, czego unikasz albo na jaką okazję szukasz perfum.

Trzy przykłady, które wstawiają tekst do pola, lecz nie wysyłają go automatycznie:

- „Coś świeżego do biura, bez wanilii”.
- „Lubię Terre d’Hermès. Co jeszcze sprawdzić?”.
- „Szukam zapachu na wieczór, ale bez ciężkiej słodyczy”.

Pole wiadomości i przykłady muszą być widoczne bez przewijania przy typowej wysokości ekranu laptopa. Dekoracja nie może spychać głównej akcji.

### Aktywna rozmowa — desktop

```text
┌─────────────────────────────────────────────────────────────┐
│ Nazwa robocza                                    PL / EN    │
├─────────────────────────────────────────────────────────────┤
│                                      │ TWÓJ KIERUNEK       │
│ Wiadomość użytkownika                │ Do biura       [×]  │
│                                      │ Świeże         [×]  │
│ Krótka odpowiedź doradcy              │ Bez wanilii    [×]  │
│ ┌──────────┬──────────┬──────────┐    │                     │
│ │ Zapach 1 │ Zapach 2 │ Zapach 3 │    │ Nowa rozmowa        │
│ └──────────┴──────────┴──────────┘    │                     │
│ [Mniej słodkie] [Bardziej dyskretne]  │                     │
│                                      │                     │
│ [Napisz, co chcesz zmienić…       ↑]  │                     │
└─────────────────────────────────────────────────────────────┘
```

Kontener maksymalnie 1280 px, obszar główny elastyczny, panel preferencji około 240 px. Tekst odpowiedzi do 65 znaków w wierszu. Wiadomości użytkownika wyrównane do prawej, odpowiedzi doradcy bez dużych dymków i bez awatarów robotów.

Composer pozostaje przy dolnej krawędzi widoku, z nieprzezroczystym tłem i miejscem w treści na jego wysokość. Nie zasłania ostatniej wiadomości ani fokusu klawiatury.

### Tablet i telefon

- Poniżej 1024 px panel boczny zmienia się w zwijany blok „Twój kierunek” nad rozmową.
- Poniżej 640 px karty rekomendacji są ułożone pionowo. Bez obowiązkowej karuzeli i ukrywania trzeciej propozycji poza ekranem.
- Marginesy boczne 16–20 px; composer uwzględnia `safe-area-inset-bottom` i klawiaturę ekranową.
- Szczegóły otwierają pełnoekranowy panel na telefonie, a szufladę boczną na desktopie.
- Porównanie na telefonie grupuje wartości według kryteriów, tak aby dwa lub trzy zapachy dało się porównać bez poziomego przewijania całej strony.

## 4. System wizualny

### Kolory

| Token | Wartość | Rola |
|---|---|---|
| `--background` | `#F7F4EE` | Ciepły papier, tło aplikacji |
| `--surface` | `#FFFDFA` | Karty, formularze i panele |
| `--text` | `#252923` | Główny tekst |
| `--text-muted` | `#62675D` | Opisy pomocnicze |
| `--accent` | `#294C3B` | Główna akcja i aktywny wybór |
| `--on-accent` | `#FFFFFF` | Tekst na głównej akcji |
| `--accent-soft` | `#E8EEE5` | Tło preferencji i zaznaczeń |
| `--border` | `#D8D5CC` | Dekoracyjne podziały i obrysy kart |
| `--control-border` | `#777C70` | Widoczne granice pól i kontrolek |
| `--warning` | `#80551B` | Niepewność i ograniczenia danych |
| `--error` | `#9B3731` | Błędy formularzy i zapytań |

Kolor nigdy nie jest jedynym nośnikiem znaczenia. Jasny `--border` nie służy jako jedyny wskaźnik interaktywności. Kontrast tekstu, kontrolek i stanów sprawdzamy przed wdrożeniem.

### Typografia

- Nagłówki redakcyjne: **Bodoni Moda**, z lokalnie dostarczonym fontem i sprawdzonym zestawem polskich znaków; fallback `Georgia, serif`.
- Interfejs i treść: **Source Sans 3**; fallback `sans-serif`.
- Nagłówek wejściowy: `clamp(2.25rem, 5vw, 4.5rem)`, interlinia 1.08. Krótkie frazy zamiast całych akapitów szeryfem.
- Nagłówki sekcji: 24–32 px. Nazwy zapachów: 22–26 px. Treść: 16–18 px, interlinia 1.55. Metadane: minimum 14 px.
- Bez długich tekstów wersalikami. Nazwy produktów zachowują pisownię katalogową.
- Ładować tylko potrzebne odmiany fontów, z `font-display: swap`; fonty nie blokują rozmowy.

### Rytm, kształty, obrazy

- Skala odstępów: 4, 8, 12, 16, 24, 32, 48, 64 px.
- Karty: promień 12 px, cienki obrys, bez ciężkich cieni. Przyciski i pola: 8 px. Preferencje mogą mieć kształt kapsułek.
- Zdjęcie flakonu na spokojnym tle, `object-fit: contain`, stałe proporcje 4:3 i zarezerwowane miejsce, żeby uniknąć skoków układu.
- Zdjęcie ma wspierać rozpoznanie, nie dominować nad uzasadnieniem wyboru.
- Brak ilustracji wygenerowanego flakonu udającej prawdziwy produkt. Zastępnik: prosty kontur butelki i tekst „Brak zdjęcia”.
- Subtelna faktura papieru jest opcjonalną dekoracją ekranu powitalnego, nigdy warstwą nad treścią.

## 5. Komponenty odpowiedzi

Nazwy odpowiadają komponentom opisanym w planie asystenta.

### `PreferenceQuestion`

Jedno pytanie i 2–4 odpowiedzi w postaci przycisków. Przykład: „Jak wyczuwalny ma być zapach?” → „Dyskretny”, „Wyrazisty”, „Bez znaczenia”. Zawsze można też odpisać własnymi słowami. Bez wymuszania pełnej ankiety.

### `PerfumeRecommendations`

Maksymalnie trzy karty, z jedną wspólną hierarchią:

1. Zdjęcie lub neutralny zastępnik.
2. Marka jako metadana, nazwa jako nagłówek.
3. Koncentracja, wyłącznie jeśli jest jednoznacznie znana.
4. „Dlaczego pasuje” — 1–2 zdania oparte na danych i preferencjach.
5. „Warto wiedzieć” — jeden istotny kompromis, np. większa słodycz niż oczekiwana.
6. Akcja „Szczegóły” i jawny wybór „Dodaj do porównania”.

Nie każda powierzchnia karty jest klikalna. Oddzielne akcje nie mogą być zagnieżdżone we wspólnym przycisku. Przy braku obrazu i długiej nazwie karta zachowuje czytelny układ.

Ocena społeczności jest opcjonalną metadaną, zawsze z liczbą głosów. Nie zastępuje uzasadnienia i nie wygląda jak wynik dopasowania.

### `PerfumeDetails`

Nagłówek z marką, nazwą i znaną wersją. Dalej: krótki profil, nuty głowy/serca/bazy, dostępne zalety i wady oraz dane społeczności. Brakujące pola otrzymują „Brak danych”, a nie wartość zerową.

Cechy wywnioskowane przez AI mają etykietę „Szacunek na podstawie opisu”. Trwałość i projekcja z głosów mają etykietę „Opinia społeczności”. Nie mieszamy tych źródeł w jeden wskaźnik.

Szuflada ma widoczny przycisk zamknięcia, obsługuje Escape, utrzymuje fokus wewnątrz i oddaje go do elementu otwierającego.

### `PerfumeComparison`

Porównanie 2–3 zapachów. Stałe kryteria: charakter, wspólne i różniące się nuty, świeżość, słodycz, intensywność oraz dostępne dane społeczności. Skale tylko z opisem znaczenia i źródła; bez dopowiadania brakujących wartości.

Limit trzech pozycji jest widoczny. Po wybraniu jednej pojawia się „Wybierz jeszcze jeden zapach”. Każdą pozycję można usunąć. Krótkie podsumowanie różnic ma pomagać wybrać próbkę, nie ogłaszać obiektywnego zwycięzcy.

### `PreferenceSummary` — „Twój kierunek”

Czytelne etykiety: „Do biura”, „Świeże”, „Bez wanilii”. Wykluczenia mają jawne „Bez”, a nie tylko inny kolor. Każde kryterium ma osobny przycisk usunięcia z dostępną nazwą, np. „Usuń warunek: bez wanilii”.

Usunięcie preferencji oraz akcje typu „Mniej słodkie” wywołują gotowe operacje, a nie interpretację kliknięcia przez model. Ponowne wyszukanie pokazuje stan zajętości; ewentualne generowanie uzasadnień może wymagać wywołania modelu.

### `NoMatch`

„Nie znalazłem dobrego dopasowania przy tych warunkach”. Następnie konkretna propozycja zmiany, np. „Dopuścić słodsze zapachy?”. Nie poluzowujemy samodzielnie wykluczonej nuty. Przycisk jasno opisuje zmieniany warunek, a odmowa pozostawia profil bez zmian.

## 6. Stany i zachowanie rozmowy

| Stan | Prezentacja i zachowanie |
|---|---|
| Interpretowanie wiadomości | Krótki status „Sprawdzam Twoje preferencje…”, bez fikcyjnych etapów |
| Szukanie propozycji | „Szukam w katalogu…”; szkielety kart dopiero gdy wiadomo, że odpowiedź zawiera rekomendacje |
| Odpowiedź w toku | Zachowana treść rozmowy, widoczna akcja przerwania, brak wielokrotnych wysłań |
| Błąd modelu lub sieci | Wiadomość użytkownika zostaje, komunikat i przycisk „Spróbuj ponownie”; bez automatycznej pętli ponowień |
| Nieznany zapach odniesienia | Prośba o opis tego, co użytkownik w nim lubi |
| Inny wariant w katalogu | Jawne ostrzeżenie przed wynikiem: porównanie dotyczy innej wersji |
| Brak tłumaczenia | Oznaczony tekst źródłowy zamiast udawanego tłumaczenia; nazwy własne bez zmian |
| Brak zdjęcia | Neutralny zastępnik bez zmiany wymiarów karty |
| Nowa rozmowa | Potwierdzenie, jeśli istnieje historia; dopiero potem wyczyszczenie rozmowy i preferencji |

Automatyczne przewijanie tylko wtedy, gdy użytkownik jest blisko końca rozmowy. Jeśli czyta wcześniejszą treść, pokaż przycisk „Nowa odpowiedź” zamiast przestawiać mu ekran. Nie ogłaszaj czytnikowi ekranu każdego dopisywanego tokenu.

## 7. Język i wiarygodność

Ton: rzeczowy, ciepły, bez egzaltacji i udawanego autorytetu. Krótkie zdania. Najpierw odpowiedź, potem ograniczenia istotne dla konkretnego wyboru.

| Unikamy | Stosujemy |
|---|---|
| „Idealne perfumy dla Ciebie” | „To dobry kierunek przy tych preferencjach” |
| „97% dopasowania” | „Pasuje, bo łączy świeżość z drzewną bazą” — tylko gdy potwierdzają to dane |
| „Na pewno utrzyma się cały dzień” | „Społeczność ocenia trwałość jako wysoką” — jeśli takie dane istnieją |
| „Kupisz za mniej niż 300 zł” | „Nie mam aktualnych cen; segment jest orientacyjny” |
| „Nie uczula” | „Wykluczenie nuty nie jest gwarancją bezpieczeństwa alergicznego” |

Pod wynikami spokojna, niedominująca wskazówka: „Przed zakupem sprawdź próbkę na skórze”. Ważne ograniczenia są przy odpowiednich danych, nie ukryte wyłącznie w stopce.

Pełne etykiety, błędy, statusy i nazwy akcji mają wersje PL/EN. Zmiana języka zachowuje preferencje i identyfikatory produktów. Język dokumentu i fragmentów źródłowych musi być prawidłowo oznaczony.

## 8. Dostępność i ruch

- Cel: WCAG 2.2 AA. Kontrast tekstu minimum 4.5:1, dużego tekstu i istotnych elementów nietekstowych minimum 3:1.
- Cała rozmowa, porównanie i szczegóły dostępne klawiaturą. Widoczny fokus: obrys 2 px z odstępem, niezasłaniany przez composer.
- Obszary dotykowe projektowane na minimum 44 × 44 px, również dla usuwania preferencji i zamykania panelu.
- Pole wiadomości ma trwałą etykietę. Enter wysyła, Shift+Enter dodaje wiersz; nie wysyłamy podczas kompozycji IME. Na telefonie zawsze dostępny jawny przycisk wysłania.
- Statusy przez spokojne `aria-live="polite"`; błędy powiązane z konkretną akcją. Bez przenoszenia fokusu po każdej odpowiedzi.
- Powiększenie tekstu do 200% i szerokość 320 px bez utraty funkcji i poziomego przewijania strony.
- Dekoracyjne zdjęcie obok pełnej nazwy może mieć pusty tekst alternatywny; samodzielny obraz produktu potrzebuje sensownego opisu.
- Animacje 120–180 ms, głównie opacity i małe przesunięcia. Jednorazowe, delikatne wejście kart; bez zapętlonych efektów „myślenia”.
- `prefers-reduced-motion` wyłącza ruch i płynne przewijanie. Działanie interfejsu nie zależy od animacji.

## 9. Kolejność wdrożenia i odbiór

1. Tokeny, typografia, responsywny szkielet oraz ekran dostępu.
2. Composer, historia i `PreferenceSummary` na danych testowych.
3. Pytania, karty, szczegóły, porównanie i brak wyników jako zamknięty zestaw komponentów.
4. Integracja z serwerowym stanem preferencji i walidowanymi odpowiedziami.
5. Stany błędów, PL/EN, dostępność i testy scenariuszy.

### Kryteria akceptacji

- Na telefonie 375 px i desktopie 1440 px można przejść od pierwszej wiadomości do porównania bez utraty kontekstu.
- Rekomendacje zawierają najwyżej trzy produkty, każdy z powodem wyboru i istotnym kompromisem, jeśli wynika z danych.
- Zmiana preferencji kliknięciem i wiadomością prowadzi do tego samego stanu; aktywne twarde wykluczenia nigdy nie są łamane.
- Odpowiedź nie pokazuje produktu spoza dozwolonego katalogu ani nie przedstawia innej wersji jako dokładnego odpowiednika.
- Brak danych, brak zdjęcia, długa nazwa, błąd sieci i brak wyników mają zaprojektowane stany.
- Przepływ działa klawiaturą, z czytnikiem ekranu, powiększeniem 200% i ograniczeniem ruchu.
- Interfejs nie podaje niepotwierdzonych cen, dostępności, bezpieczeństwa alergicznego ani pozornie dokładnego procentu dopasowania.
- Przed użyciem zdjęć nawet w teście należy ustalić dopuszczalność ich wykorzystania; do tego czasu można pracować na neutralnych zastępnikach. Publiczny start wymaga także wyjaśnienia praw do opisów i recenzji.

### Poza pierwszą wersją

Tryb ciemny, konta, historia między sesjami, kolekcja posiadanych perfum, integracje sklepowe i rozbudowany onboarding. Najpierw dopracowujemy jedną rozmowę i wiarygodność trzech propozycji.
