import db from './db';
import exporter from './exporter';
import { Rate } from './models/rate';

interface SheetRow {
  startWeight: string;
  endWeight: number;
  zones: {
    [name: string]: number;
  };
}
interface Sheet {
  [name: string]: SheetRow;
}
export interface SheetData {
  name: string;
  rows: (string | number)[][];
}

/**
 * Queries the rate db and generates an array of pre formatted sheet names.
 * @returns {Promise<string[]>} [<locale>,<shipping_speed>]
 */
const getSheetNames = async (): Promise<string[]> => {
  const rates = await db.rate.findAll({
    where: {
      client_id: 1240,
    },
    group: ['locale', 'shipping_speed'],
  });

  const sheetNames = rates.reduce((names: string[], rate: Rate) => {
    const locale = rate.getDataValue('locale');
    const speed = rate.getDataValue('shipping_speed');
    const sheetName = `${locale},${speed}`;
    return names.includes(sheetName) ? [...names] : [...names, sheetName];
  }, []);

  return sheetNames;
};

/**
 * Formats the data into array data in the form of [column][row]
 * @param rates The queried results of rates
 * @returns { (string | number)[][] } formattedRowDate in the form of [column][row]
 */
const formatRowData = (rates: Rate[]): (string | number)[][] => {
  const headers = ['Start Weight', 'End Weight'];

  const reducedRows = rates.reduce((rowsAcc: Sheet, rate: Rate) => {
    const zone = rate.getDataValue('zone');
    const startWeight = rate.getDataValue('start_weight') ?? '0';
    const endWeight = rate.getDataValue('end_weight') ?? 0;
    const rateValue = rate.getDataValue('rate') ?? 0;
    const formattedZone = `Zone ${zone}`;

    if (!headers.includes(formattedZone)) {
      headers.push(formattedZone);
    }

    const existingRow: SheetRow = rowsAcc[startWeight];
    if (!existingRow) {
      const row: SheetRow = {
        startWeight,
        endWeight,
        zones: {},
      };

      row.zones[formattedZone] = rateValue;
      rowsAcc[startWeight] = row;
    } else {
      const existingZone = existingRow.zones[formattedZone];
      const zoneValue = existingZone ? existingZone + rateValue : rateValue;

      rowsAcc[startWeight].zones[formattedZone] = zoneValue;
    }

    return rowsAcc;
  }, {});

  const rows = Object.values(reducedRows).map((row: SheetRow) => {
    const data = [row.startWeight, row.endWeight];
    const zoneValues = Object.values(row.zones);
    zoneValues.forEach((zone) => {
      data.push(zone);
    });
    return data;
  });

  return [headers, ...rows];
};

/**
 * Query the db to get properly grouped rates and format sheet data into properly
 * formatted sheet column and row data.
 * @param sheetName The preformatted name of the sheet <locale>,<shipping_speed>
 * @returns {<Promise<SheetData>}
 */
const sheetData = async (sheetName: string): Promise<SheetData> => {
  // format the sheet name and get query params
  const names = sheetName.split(',');
  const locale = names[0];
  const shipping_speed = names[1];
  const speedFixed = shipping_speed.replace('intl', '');
  const localUpper = locale.charAt(0).toUpperCase() + locale.slice(1);
  const speedUpper = speedFixed.charAt(0).toUpperCase() + speedFixed.slice(1);

  // query rates by client, locale and shipping in order to get properly grouped sheet data
  const rates = await db.rate.findAll({
    where: {
      client_id: 1240,
      locale,
      shipping_speed,
    },
  });

  return {
    name: `${localUpper} ${speedUpper} Rates`,
    rows: formatRowData(rates),
  };
};

/**
 * Application entry point.
 * @returns {Promise<void>}
 */
const run = async (): Promise<void> => {
  const sheetNames = await getSheetNames();
  const promises = sheetNames.map(async (sheetName: string) => await sheetData(sheetName));
  const sheetsData = await Promise.all(promises);

  await exporter.xlxs(sheetsData, 'xlsx');
};

// run the app
run();
