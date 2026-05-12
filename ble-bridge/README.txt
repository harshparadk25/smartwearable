BLE Bridge Quick Notes

- Edit config.json with your device name or id.
- Run scan mode to list nearby BLE devices:
  npm run scan
- Start the bridge:
  npm run start
- Optional: set API_TOKEN if backend requires auth.
- Bridge control API (default http://localhost:7070):
  POST /scan    -> returns nearby watches
  POST /connect -> connect to selected watch
