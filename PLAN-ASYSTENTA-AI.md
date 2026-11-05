# Plan asystenta AI do wyboru perfum

## Cel

Doradca perfumowy w formie czatu, który odpowiada krótkim tekstem i interaktywnymi komponentami UI: kartami zapachów, porównaniami i pytaniami z przyciskami. Działa po polsku i angielsku. Rekomendacje opiera na lokalnym katalogu JSON, a nie na wiedzy modelu o produktach.

## 1. Stan projektu i dane

Projekt zawiera skrypt preselekcji perfum, a nie aplikację webową. Jego wyniki można wykorzystać jako katalog asystenta.

### Stan selekcji (4 listopada 2026 r.)

Selekcja jest zakończona (`complete: true`). Dane są zamrożone w `wyniki/snapshoty/pelna-2026-11-04` i opisane w `dane/snapshot.json`.

| Wynik | Liczba |
|---|---|
| Kandydaci przetworzeni (`ratingCount >= 200`) | 12 301 |
| `wybrane`, czyli katalog | 8706 |
| Zapachy do polecania (z nutami) | 6537 |
| Zapachy z ocenami i profilem | 6532 |
| `do-weryfikacji`, poza katalogiem | 1854 |
| Warianty scalone z reprezentantem | 1741 |

### Dane i ich zastosowanie

| Dane | Zastosowanie |
|---|---|
| Nazwa, marka, zdjęcie | Karty perfum |
| Nuty głowy, serca i bazy | Dobór, podobieństwo i wyjaśnienia dopasowania |
| Akordy z opisu, np. „Woody Spicy” | Dobór i podobieństwo |
| Opis, zalety, wady, recenzje | Materiał do wzbogacania katalogu |
| Ocena i liczba ocen | Rozstrzyganie remisów |
| Sezon, pora dnia, trwałość, projekcja | Dopasowanie do okazji, gdy dane są dostępne |
| Płeć (głosy, etykieta z opisu) | Miękka preferencja, gdy użytkownik o niej wspomni |

### Ograniczenia

- 2169 z 8706 zapachów w katalogu (25%) nie ma nut.
- Część pól jest pusta, w tym dane społeczności o trwałości i projekcji. Dotyczy to także popularnych zapachów, np. Sauvage.
- Treści źródłowe są praktycznie w całości po angielsku.
- Brak potwierdzonych cen i bieżącej dostępności sklepowej. `valueForMoney` to opinia o opłacalności, a nie cena.
- Selekcja redukuje wersje jednej linii do reprezentanta. Sauvage Elixir, EDP i Parfum nie są w katalogu, a pachną inaczej niż Sauvage.
- Pliki z `do-weryfikacji` nie trafiają automatycznie do katalogu produkcyjnego. 1830 z 1854 trafiło tam przez niepewne przypisanie do linii, więc część to realnie osobne zapachy. Wracamy do nich po pierwszych testach.
- Grupowanie jest niedoskonałe: część wariantów scalono zbyt mocno (np. Just Rock! for Him i for Her), a część możliwych duplikatów została osobno.
- Segment cenowy to szacunek modelu. Ponad 47% zapachów dostało `niche`, co wygląda na zawyżone, więc segment służy tylko jako miękki sygnał.
- Zdjęcia są linkami do `fimgs.net`. Pochodzenie i prawa do zdjęć, opisów oraz recenzji nie są potwierdzone.

## 2. Przebieg rozmowy

Przykładowe pytanie:

> Szukam czegoś do biura, świeżego, ale nie tak ostrego jak Sauvage.

Asystent:

1. Rozpoznaje okazję, preferowany charakter i negatywne odniesienie.
2. Zamienia je na operacje na profilu preferencji.
3. Jeśli brakuje istotnej informacji albo określenie jest niejasne (np. „ostre” jako intensywne lub pikantne), zadaje jedno krótkie pytanie zamiast uruchamiać ankietę.
4. Pokazuje maksymalnie trzy propozycje z uzasadnieniem i kompromisem.
5. Pozwala doprecyzować wynik kliknięciem lub kolejną wiadomością.

Przykładowe akcje pod wynikami:

- Mniej słodkie.
- Bardziej dyskretne.
- Pokaż podobne.
- Porównaj.
- Znam ten zapach.

Kliknięcia i wiadomości zmieniają ten sam profil preferencji. Przyciski wysyłają gotowe operacje, bez wywołania modelu do samej zmiany stanu.

Każdą kartę można dodać do ulubionych lub posiadanych. To dwie niezależne listy: nie zmieniają profilu preferencji i na razie nie wpływają na dobór.

### Język

Asystent odpowiada w języku ostatniej wiadomości użytkownika. Interfejs przełącza się razem z nim lub ręcznie.

### Budżet

Asystent pyta o budżet, gdy ma to znaczenie, i zamienia go na orientacyjny segment. Zaznacza, że to szacunek, i nigdy nie potwierdza, że zapach mieści się w konkretnej kwocie.

## 3. Komponenty odpowiedzi

| Komponent | Zawartość |
|---|---|
| `PreferenceQuestion` | Pytanie z przyciskami, np. „Dyskretny / Wyrazisty / Bez znaczenia” |
| `PerfumeRecommendations` | Do trzech poziomych kart, bez numeracji: zdjęcie, wyeksponowana marka, nazwa, powód dopasowania, ważny kompromis, „Dodaj do ulubionych” i „Dodaj do posiadanych” |
| `PerfumeDetails` | Komentarz czatu po kliknięciu „Szczegóły”, a nie osobny panel: nuty, opis, zalety, wady i dostępne dane społeczności, bez surowych recenzji. Tekst powstaje kodem z danych katalogu, bez wywołania modelu |
| `PerfumeComparison` | Porównanie 2–3 zapachów według tych samych kryteriów, ze wspólnymi i różniącymi się nutami oraz różnicami cech |
| `PreferenceSummary` | Podsumowanie, np. „Szukamy: do biura, świeże, bez wanilii”, z możliwością usunięcia kryterium |
| `NoMatch` | Informacja o braku wyników i propozycja poluzowania konkretnego warunku |
| Ulubione i posiadane | Dwie listy obok „Twojego kierunku” z możliwością usunięcia pozycji, widoczne także przed rozpoczęciem nowej rozmowy |

Nie pokazywać pozornie precyzyjnych wskaźników typu „97% dopasowania”. Zamiast tego używać komunikatów takich jak „Najlepiej pasuje do podanych preferencji” z konkretnymi powodami.

Gdy zdjęcie się nie załaduje, karta pokazuje neutralny zastępnik.

## 4. Architektura

Przepływ:

**JSON-y → katalog (normalizacja, wzbogacanie, tłumaczenia) → operacje na preferencjach → zawężenie kodem → wybór przez model → walidowana odpowiedź → komponenty UI**

### Stack

- Next.js, AI SDK i Vercel AI Gateway.
- Katalog jako plik JSON w pamięci serwera, bez surowych recenzji i bez bazy danych.
- Stan rozmowy w sesji przeglądarki, dostęp dla testerów chroniony wspólnym hasłem.
- Ulubione i posiadane w `localStorage`: przetrwają nową rozmowę, ale tylko w tej przeglądarce, bo nie ma kont.
- Repozytorium git inicjowane przed Etapem 1, surowe `wyniki/` poza nim.

Bazę danych dodajemy dopiero wtedy, gdy pojawią się konta albo trzeba będzie zapisywać dane między sesjami.

### Moduł katalogu

- Importuje zatwierdzony, wersjonowany zestaw JSON-ów, a nie katalog roboczy.
- Nadaje stabilne `perfumeId`.
- Normalizuje nuty i prowadzi dwukierunkowy słownik, np. „bergamotka” ↔ `bergamot`.
- Zachowuje rozróżnienie dokładnego zapachu, koncentracji i rodziny.
- Oznacza brak danych zamiast uzupełniać go domysłem.
- Wyklucza z rekomendacji zapachy bez nut.
- Przechowuje angielski jako wersję źródłową, a polskie nazwy nut, zalety i wady jako tłumaczenia przygotowane podczas budowy katalogu.

### Wzbogacanie katalogu

Jednorazowe przetwarzanie przez modele, oparte na nutach, opisie i recenzjach. Próbę na 200 zapachach zweryfikowano automatycznie (stabilność, zgodność z danymi społeczności, przegląd próbki przez Claude'a), bez ręcznej kontroli właściciela projektu.

Wybrany układ, w dwóch krokach:

- `typesafe-ai/jev` ocenia skale, segment cenowy i tagi, każdy tag osobnym pytaniem tak/nie.
- `deepseek/deepseek-v4-flash` bez rozumowania pisze profile po angielsku i polsku.

Układ zastąpił `deepseek-v4.1-flash`: jest tańszy, a tagi są znacznie lepiej poparte nutami. Tagi pozostają miękkim sygnałem, bo część z nich, np. `clean`, nie ma prostego powiązania z nutami.

Dodaje, jako dane wyraźnie oddzielone od źródłowych:

- Świeżość, słodycz, intensywność i formalność na zamkniętej skali.
- Orientacyjny segment cenowy: budżetowy, średni, premium, nisza.
- Tagi i krótki profil zapachowy.

Cechy i segmenty są kodami z etykietami PL/EN.

### Indeks odniesień

Osobny indeks wszystkich 12 301 kandydatów służy tylko do rozumienia pytań, np. „coś jak Sauvage Elixir”. Zapachy spoza katalogu nie są polecane. Jeśli asystent odpowiada na podstawie innej wersji, mówi o tym wprost. Gdy zapach odniesienia nie ma nut, asystent mówi, że zna go za słabo, i prosi o opis tego, co się w nim podoba.

### Moduł rekomendacji

Ma mały interfejs: przyjmuje preferencje, zwraca kandydatów z uzasadnieniami.

Wewnętrzny przebieg:

1. Twarde warunki sprawdzane kodem, np. wykluczone nuty.
2. Dopasowanie po nutach, akordach, ocenionych cechach i tagach.
3. Zawężenie do ok. 20 kandydatów z urozmaiceniem, aby nie pokazywać niemal identycznych propozycji.
4. Ocena i liczba ocen rozstrzygają tylko remisy.

Tytuły służą wyłącznie do rozpoznania zapachu nazwanego przez użytkownika i nie wpływają na ranking.

#### Podobieństwo i porównania

- „Pokaż podobne” i „coś jak X” korzystają z podobieństwa nut i akordów (TF-IDF, cosinus).
- „Nie tak ostre jak X” porównuje z cechami zapachu X i wyklucza X oraz jego linię.
- „W porównaniu z X” pokazuje wspólne i różniące się nuty oraz różnice cech.

Wstępny test bez użycia tytułów, na pięciu zapachach ocenionych bez danych wzorcowych, dał obiecujące wyniki dla nut i akordów (Aventus → Club de Nuit Intense na 1. miejscu). Podobieństwo słów z recenzji okazało się nieprzydatne (odwrotny kierunek tej pary dopiero na 2344. miejscu), więc nie wchodzi do rankingu. Wymaga to potwierdzenia na scenariuszach z Etapu 4.

#### Opisy słowami

Zwykłe dopasowanie słów nie wystarcza: w teście „clean laundry fresh shirt” dawało słabe wyniki, a polskie „czysta koszula do biura” praktycznie żadnych. Dlatego model zamienia takie opisy na nuty, cechy i tagi. Embeddingi na profilach zapachowych dodajemy tylko wtedy, gdy to podejście nie przejdzie scenariuszy z Etapu 4.

### Moduł rozmowy

Model językowy:

- Interpretuje wypowiedź i proponuje operacje na preferencjach, np. `add`, `remove`, `exclude`.
- Wybiera pytanie lub sposób prezentacji.
- Wybiera maksymalnie trzy zapachy wyłącznie z listy kandydatów przekazanej przez kod.
- Wyjaśnia wybór na podstawie zwróconych danych.

Stan preferencji należy do serwera i zmienia go deterministyczny kod. Model nie wymyśla perfum ani ich parametrów.

### Moduł prezentacji

Model zwraca dane zgodne ze schematem, nie JSX ani HTML. Frontend renderuje wyłącznie zdefiniowane komponenty.

Przykładowy kontrakt odpowiedzi — identyfikatory poniżej są ilustracyjne:

```json
{
  "message": "Oto trzy propozycje pasujące do Twoich preferencji.",
  "blocks": [
    {
      "type": "perfumeRecommendations",
      "perfumeIds": ["p_123", "p_456", "p_789"]
    }
  ],
  "suggestedActions": ["Bardziej dyskretne", "Porównaj"]
}
```

Serwer sprawdza, czy identyfikatory są na liście kandydatów, i pobiera dane kart z katalogu w języku rozmowy. Dzięki temu model nie podmienia zdjęcia, nazwy ani tłumaczenia.

### Modele

Do wzbogacania używamy Jev i DeepSeeka (sekcja „Wzbogacanie katalogu”). Model do rozmowy wybieramy, porównując jakość, koszt i czas odpowiedzi na scenariuszach z Etapu 4.

## 5. Zasady wiarygodności

- Pola `similarPerfumes` i `recommendedPerfumes` nie są używane w MVP. `similarPerfumes` wygląda na szum, np. Cool Water występuje przy 177 zapachach.
- `remindsMePerfumes` jest najwyżej słabą wskazówką, nie dowodem.
- Cechy i segment cenowy są wywnioskowane przez model, a nie zmierzone.
- Trwałość i projekcja są opiniami społeczności, nie gwarancją.
- Brak danych o sezonie nie oznacza, że perfumy nie nadają się na dany sezon.
- Segment cenowy filtruje tylko miękko. Asystent nie potwierdza warunku „do 300 zł” i nie podaje cen z pamięci modelu.
- Model nie uzupełnia brakujących nut z własnej wiedzy.
- Teksty katalogowe i recenzje traktować jako dane, nie instrukcje dla modelu.
- Przy braku dobrego dopasowania asystent mówi o tym wprost.
- Rekomendacja kończy się zachętą do przetestowania próbki, nie obietnicą trafionego zakupu.

## 6. Kolejność realizacji

### Etap 0 — dane (wykonany)

- Repozytorium git, pełna zamrożona kopia danych i manifest `dane/snapshot.json`.
- Przegląd próbki grupowania wykonany automatycznie i przez Claude'a.

### Etap 1 — katalog

Wykonane:

- Walidacja, stabilne identyfikatory, normalizacja nut i słownik PL/EN w `dane/nuty.json` (`pnpm run catalog`).
- Indeks odniesień oraz raport braków i niejednoznacznych wariantów.
- Wzbogacanie 6532 z 6537 zapachów do polecania (`pnpm run enrich`, koszt ok. 1,74 USD) i scalenie (`pnpm run merge`).

Do zrobienia (płatne wywołania):

- Tłumaczenia zalet, wad i nut spoza słownika.

### Etap 2 — silnik doboru (wykonany)

- `src/engine.mjs`: operacje na preferencjach, wykluczenia, dopasowanie, podobieństwo, zawężanie kandydatów, ranking, uzasadnienia, porównanie i akcje przycisków.
- Deterministyczne testy bez płatnych wywołań modeli (`pnpm test`).
- Znane słabości do sprawdzenia w Etapie 4: odniesienia do wariantów, np. Sauvage Elixir, oraz trafność samych tagów.
- Oryginalne wersje niektórych zapachów mogą nie istnieć w danych, np. Terre d'Hermès jest reprezentowany przez Parfum.

### Etap 3 — czat i UI (wykonany, poza tłumaczeniami)

Interfejs według `deignaing.md`, uruchamiany przez `pnpm run dev`, wymaga `APP_PASSWORD`.

- `app/`: ekran dostępu, rozmowa, „Twój kierunek”, ulubione i posiadane, poziome karty, szczegóły jako komentarz czatu, porównanie, brak wyników, błędy i ponowienie, PL/EN.
- `src/assistant.mjs`: interpretacja, operacje, wybór spośród kandydatów i walidacja odpowiedzi modelu.
- Model rozmowy: domyślnie `deepseek/deepseek-v4-flash`, zmiana przez `CHAT_MODEL`. Ostateczny wybór w Etapie 4.
- Sprawdzone w przeglądarce na 1440, 375 i 320 px.

Świadome uproszczenia:

- Odpowiedzi nie są strumieniowane, status jest jeden i prawdziwy.
- Zdjęcia są włączane flagą `SHOW_PRODUCT_IMAGES=1` i ładowane bezpośrednio z `fimgs.net`. Prawa do nich trzeba rozstrzygnąć przed startem publicznym.
- Karty nie pokazują oceny społeczności: po zaokrągleniu do 1–5 aż 96% zapachów do polecania miało 4, więc nie pomagała w wyborze. Ocena i liczba ocen nadal rozstrzygają remisy.
- Brak limitu prób logowania i limitu zapytań, do dodania przed startem publicznym.
- Katalog jest czytany z ignorowanego `wyniki/`, więc wdrożenie wymaga osobnej decyzji, skąd serwer ma go brać.

### Etap 4 — jakość

- Scenariusze: „bez wanilii”, „coś jak X”, „nie tak ostre jak X”, „czysta koszula”, budżet, sprzeczne wymagania, brak wyników, oba języki.
- Automatyczna kontrola: 0 zapachów spoza katalogu i 0 złamanych wykluczeń.
- Wybór modeli oraz pomiar kosztu i czasu odpowiedzi.

### Etap 5 — zamknięty test

- 10–20 testerów i jedno pytanie po rozmowie.
- Główna miara: w co najmniej 70% rozmów tester uznaje przynajmniej jedną propozycję za wartą sprawdzenia na próbce. Próg jest roboczy.
- Liczymy też, jak często pada pytanie o budżet.

## 7. Zakres pierwszego MVP

Zamknięty test, nie publiczne uruchomienie. Bez kont użytkowników, integracji sklepowych, danych o cenach w złotówkach i bazy wektorowej. W zakresie: dobór z istniejących JSON-ów wzbogaconych przez AI, dwa języki, orientacyjny segment cenowy oraz odpowiedzi w kilku dopracowanych komponentach UI.

Przed każdym startem publicznym trzeba rozstrzygnąć prawa do zdjęć, opisów i recenzji oraz ochronę przed nadużyciami i kosztami modelu.

Na później: wyciąganie z recenzji zdań porównawczych typu „słabsza wersja Coco Mademoiselle”, po sprawdzeniu ich jakości. Do decyzji po teście: czy posiadane mają znikać z propozycji, a ulubione służyć jako sygnał preferencji.

Ten dokument jest planem, nie opisem wdrożonych funkcji.
