import axios from "axios";

// 1. można odrazu otrzymać cenę w PLN z api appla, dodając parametr: &country=PL
// 1.1. założenie - nie można użyć parametru: &country=PL - domyślnie US - zawsze zwraca walute w USD
// 2. istnieje wiele książek dla tej samej nazwy i autora - przy sprawdzeniu wszystkie ceny były takie same, więc nie opłaca się szukać minimum
// 2.1. założenie - dodanie parametru &limit=1
// 3. aby ograniczyć zapytania do api NBP można najpierw pobrać dane z api appla i wybrać unikalne daty - bez powtórzeń
// 3.1 jeśli w punkcie 1.1. zwracane byłyby różne waluty - należy pogrupować jednocześnie po dacie i walucie - można użyć hasha
// 3.2. maksymalny przedział czasu do pobrania z api NBP to 1 rok, można:
// 3.2.a. podzielić daty na mnijszą ilość przedziałów
// 3.2.b. iterować po każdej dacie
// 3.3. założenie: iterować po każdej dacie i każdą podać do api NBP
// 3.4. w zależności od typu tabeli : a | b | c - zwracane odpowiedzi od NBP się różnią
// 3.5. założenie - tabela typu a
// 3.6. czasami NBP nie zwraca odpowiedzi dla kontkretnej daty

type EbookReq = {
  author: string;
  name: string;
};

type EbookRes = {
  name: string;
  title: string;
  curr: string;
  price: number;
  date: string;
};

type NBPReq = {
  date: string;
  curr: string;
};

type NBPRes = {
  date: string;
  rate: number;
  tableNo: string;
};

type NBPTableType = "a" | "b" | "c";

const NBP_TABLE: NBPTableType = "a";
const ENDPOINT_APPLE = "https://itunes.apple.com/search";
const ENDPOINT_NBP = "http://api.nbp.pl/api";

const INPUT: EbookReq[] = [
  { author: "Agatha Christie", name: "The Mysterious Affair at Styles" },
  { author: "Agatha Christie", name: "The Secret Adversary" },
  { author: "Agatha Christie", name: "And Then There Were None" },
  { author: "Agatha Christie", name: "Murder on the Orient Express" },
  { author: "Agatha Christie", name: "The Murder of Roger Ackroyd" },
  { author: "Agatha Christie", name: "Death on the Nile" },
  { author: "Agatha Christie", name: "Murder on the Orient Express" },
];

// ODPOWIEDŹ na INPUT
// [
//   {
//     name: 'Agatha Christie',
//     title: 'The Mysterious Affair at Styles',
//     curr: 'USD',
//     date: '2008-07-27',
//     price: 0,
//     fromNBP: {}
//   },
//   {
//     name: 'Agatha Christie',
//     title: 'The Secret Adversary',
//     curr: 'USD',
//     date: '2008-09-14',
//     price: 0,
//     fromNBP: {}
//   },
//   {
//     name: 'Agatha Christie',
//     title: 'And Then There Were None',
//     curr: 'USD',
//     date: '2009-03-17',
//     price: 9.99,
//     fromNBP: { rate: 3.4373, pricePLN: 34.338627, tableNo: '53/A/NBP/2009' }
//   },
//   {
//     name: 'Agatha Christie',
//     title: 'Murder on the Orient Express',
//     curr: 'USD',
//     date: '2003-10-28',
//     price: 8.99,
//     fromNBP: { rate: 3.9745, pricePLN: 35.730755, tableNo: '210/A/NBP/2003' }
//   },
//   {
//     name: 'Agatha Christie',
//     title: 'The Murder of Roger Ackroyd',
//     curr: 'USD',
//     date: '2009-03-17',
//     price: 14.99,
//     fromNBP: { rate: 3.4373, pricePLN: 51.525127, tableNo: '53/A/NBP/2009' }
//   },
//   {
//     name: 'Agatha Christie',
//     title: 'Death on the Nile',
//     curr: 'USD',
//     date: '2005-07-05',
//     price: 13.99,
//     fromNBP: { rate: 3.3706, pricePLN: 47.154694, tableNo: '128/A/NBP/2005' }
//   },
//   {
//     name: 'Agatha Christie',
//     title: 'Murder on the Orient Express',
//     curr: 'USD',
//     date: '2003-10-28',
//     price: 8.99,
//     fromNBP: { rate: 3.9745, pricePLN: 35.730755, tableNo: '210/A/NBP/2003' }
//   }
// ]

async function getNbp(input: NBPReq[]) {
  const fetchHelper = async (nbp: NBPReq) => {
    const { curr, date } = nbp;
    return axios.get(
      `${ENDPOINT_NBP}/exchangerates/rates/${NBP_TABLE}/${curr}/${date}/?format=json`
    );
  };
  const settledPromises = await Promise.allSettled(input.map(fetchHelper));
  const res = new Map<string, NBPRes>();
  settledPromises.forEach((settledPromise, index) => {
    if (settledPromise.status === "fulfilled") {
      const v = settledPromise.value.data.rates[0];
      res.set(v.effectiveDate, {
        date: v.effectiveDate,
        rate: v.mid,
        tableNo: v.no,
      });
    } else {
      console.error(`Request ${index + 1} rejected:`, settledPromise.reason);
    }
  });
  return res;
}

async function getApple(input: EbookReq[]): Promise<EbookRes[]> {
  const fetchHelper = async (ebook: EbookReq) => {
    const { author, name } = ebook;
    return axios.get(
      `${ENDPOINT_APPLE}/?term=${name}&artistName=${author}&entity=ebook&attribute=titleTerm&limit=1`
    );
  };

  const settledPromises = await Promise.allSettled(input.map(fetchHelper));
  const res: EbookRes[] = [];
  settledPromises.forEach((settledPromise, index) => {
    if (settledPromise.status === "fulfilled") {
      const v = settledPromise.value.data.results[0];
      res.push({
        name: v.artistName,
        title: v.trackName,
        curr: v.currency,
        date: v.releaseDate.split("T")[0],
        price: v.price,
      });
    } else {
      console.error(`Request ${index + 1} rejected:`, settledPromise.reason);
    }
  });
  return res;
}

async function main() {
  const apple = await getApple(INPUT);
  const datesFromApple = new Map<string, NBPReq>(
    apple.map((a) => {
      const { date, curr } = a;
      return [date, { date, curr }];
    })
  );
  const nbp = await getNbp(
    Array.from(datesFromApple, ([_, v]) => {
      return {
        curr: v.curr,
        date: v.date,
      };
    })
  );

  const appendedApple = apple.map((a) => {
    const s = nbp.get(a.date);
    return {
      ...a,
      fromNBP: s
        ? {
            rate: s.rate,
            pricePLN: s.rate * a.price,
            tableNo: s.tableNo,
          }
        : {},
    };
  });

  // console.log(datesFromApple);
  // console.log(nbp);
  console.log(appendedApple);
}

void main();
