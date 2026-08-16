export * from "wagmi-connectors-asli";

const dihapus = (nama: string) => () => {
  throw new Error(`Connector "${nama}" sudah dihapus di wagmi v3.`);
};

export const gemini = dihapus("gemini");
export const porto = dihapus("porto");
