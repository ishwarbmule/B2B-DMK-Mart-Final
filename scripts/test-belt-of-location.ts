import { beltOfLocation, servingWarehouseFor } from "../src/lib/maharashtra";
const cities = ["SUPA","Kolhar Budruk","Wagholi","Pune, Wagholi","Pune,Kharadi","Pune City,Shrukwar Peth","Kesnand","Supe","Shirdi","Amravati","Dhanora","Manjari","Lohegaon","Kharadi","Whagholi","Paratwada","Nagpur","Mumbai"];
for (const c of cities) console.log(c.padEnd(26), "→", beltOfLocation(c));
const whs = [
  { id: "k", name: "KOLHAR WARE HOUSE", code: "WH-MAIN", city: "KOLHAR" },
  { id: "p", name: "DMK MART PUNE", code: "PDMKMAIN01", city: "PUNE" },
];
console.log("PUNE belt wh:", servingWarehouseFor(whs, "PUNE")?.name);
console.log("KOLHAR belt wh:", servingWarehouseFor(whs, "KOLHAR")?.name);
