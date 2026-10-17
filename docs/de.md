# Whois

## Überblick

Diese Integration überwacht den Ablauf Ihrer Domainnamen in Gladys: die verbleibenden Tage bis zum Ablauf jeder Domain, ihr Ablaufdatum, ihren Registrar und ihren Zustand. Jede Domain wird einmal täglich bei ihrer Registry geprüft, über RDAP (den Nachfolger von Whois) oder, für Endungen ohne RDAP, über Whois. Eine vergessene Domain legt Website und E-Mails am Tag ihres Ablaufs still: Szenen warnen Sie Wochen vorher.

![Das Domain-Widget: der nächste Ablauf zuerst, mit den verbleibenden Tagen (generierte Illustration, kein Screenshot)](https://raw.githubusercontent.com/William-De71/gladys-whois/main/docs/assets/widgets.de.png)

Diese Community-Integration ist mit keiner Registry und keinem Registrar verbunden.

## Voraussetzungen

- Gladys Assistant 5.1.0 oder neuer.
- Internetzugang von Gladys. Kein Konto, kein Schlüssel.

## Konfiguration

| Feld              | Rolle                                                                                                      |
| ----------------- | ---------------------------------------------------------------------------------------------------------- |
| Domainnamen       | Bis zu zehn, durch Kommas getrennt. Eine Webadresse geht auch: `https://www.example.de/` ist `example.de`. |
| Sprache der Texte | Sprache der Funktionsnamen, Textzustände und Szenen-Zusammenfassungen. Standardmäßig automatisch.          |

Die Schaltfläche **Domain prüfen** fragt sofort die Registry einer beliebigen Domain ab, ohne sie zu überwachen. **Jetzt prüfen** prüft alle Domains erneut (geschieht sonst einmal täglich, nachts). Der Verbindungsstatus listet die Domains ohne Antwort und die Eingaben, die keine Domainnamen sind.

## Verwendung

### Geräte

Öffnen Sie den Reiter **Entdecken** und fügen Sie die Geräte hinzu, eines pro Domain. Jedes hat: die Tage bis zum Ablauf (negativ nach Ablauf), das Ablaufdatum, den Registrar und den Zustand: Aktiv, Läuft bald ab (30 Tage oder weniger), Abgelaufen, Wiederherstellungsfrist (abgelaufen, gegen Gebühr wiederherstellbar) oder Löschung steht bevor.

### Dashboard-Widget

**Domainnamen**: die Anzahl der überwachten Domains, die Tage bis zum nächsten Ablauf, dann jede Domain, der nächste Ablauf zuerst, mit Datum, Registrar und den verbleibenden Tagen als farbigem Abzeichen (orange ab 30 Tagen, rot ab 7).

### Szenen

- **Domain: läuft bald ab**: die Domain läuft in 90, 60, 30, 14, 7, 3 oder 1 Tag oder weniger ab, oder am Tag selbst. Jede Schwelle löst einmal pro Ablaufdatum aus. Werden mehrere auf einmal erreicht (eine Domain 5 Tage vor Ablauf hinzugefügt), wird nur die dringendste gesendet.
- **Domain: verlängert**: das Ablaufdatum wurde verschoben; die Schwellen beginnen ab dem neuen Datum von vorn.
- Aktion **Domain: Ablauf lesen**: verbleibende Tage, Datum, Registrar, Zustand und eine Zusammenfassung für eine Nachricht.

Beispiele: 30 Tage vor Ablauf „example.de läuft in 30 Tagen ab (19. Dezember 2026).“ per Telegram senden; bei der Verlängerung dem Kassenwart des Vereins danken.

### Transport

Die Integration fragt die Registries über das Internet ab (Abzeichen „cloud“): nur der Domainname steht in den Anfragen, nichts über Sie verlässt Ihr Netzwerk. Eine Anfrage pro Domain und Tag.

### Endungen

RDAP deckt .com, .net, .org, .fr, .uk, .nl, .dev, .app und die meisten Endungen ab; Whois weitere wie .io und .it. Manche Registries veröffentlichen gar kein Ablaufdatum (.de, .eu, .be, .ch): die Domain wird dann mit diesem Grund aufgeführt, und kein Gerät wird angeboten.

## Fehlerbehebung

- **„Kein Domainname“**: prüfen Sie die Schreibweise; eine IP-Adresse oder ein Name ohne Endung wird abgelehnt.
- **„Nicht registriert“**: die Registry kennt die Domain nicht (Tippfehler oder gelöschte Domain).
- **„Die Registry begrenzt die Anfragen“**: manche Whois-Server lehnen häufige Anfragen ab. Die Integration versucht es später selbst erneut und behält die letzte Antwort.
- **Fehlerbericht**: klicken Sie auf **Diagnose** und kopieren Sie die Zeilen „Diagnostic:“ aus dem Reiter Protokolle, mit den Versionen von Gladys und der Integration (Gladys gibt `DEBUG` nicht an den Container weiter).
