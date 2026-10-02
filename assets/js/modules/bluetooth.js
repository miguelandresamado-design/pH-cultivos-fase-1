export class YKS01Adapter {
  constructor(config = {}) {
    this.config = config;
    this.device = null;
    this.characteristic = null;
    this.listener = null;
    this.mode = "simulation";
  }
  supportsWebBluetooth() { return "bluetooth" in navigator; }
  canConnectReal() { return Boolean(this.config.serviceUuid && this.config.characteristicUuid); }
  async connect() {
    if (!this.canConnectReal()) throw new Error("Modo real bloqueado: faltan los UUID validados del YK-S01");
    if (!this.supportsWebBluetooth()) throw new Error("Web Bluetooth no está disponible. Usa lectura manual o Bluefy en iPhone.");
    this.mode = "real";
    this.device = await navigator.bluetooth.requestDevice({ filters: [{ services: [this.config.serviceUuid] }] });
    const server = await this.device.gatt.connect();
    const service = await server.getPrimaryService(this.config.serviceUuid);
    this.characteristic = await service.getCharacteristic(this.config.characteristicUuid);
    return this.device;
  }
  simulateReading() {
    this.mode = "simulation";
    return Number((5.05 + Math.random() * 0.75).toFixed(2));
  }
  disconnect() {
    if (this.device?.gatt?.connected) this.device.gatt.disconnect();
    this.device = null;
    this.characteristic = null;
  }
}
