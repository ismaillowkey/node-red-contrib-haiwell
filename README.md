![Platform Node-RED](https://img.shields.io/badge/Platform-Node--RED-red.png)
![Contribution Haiwell](https://img.shields.io/badge/Contribution-Haiwell-orange.png)
![NodeJS_Version](https://img.shields.io/badge/NodeJS-LTS-green.png)

# node-red-contrib-haiwell

### Node-RED custom nodes for Haiwell PLC Modbus Communication

> **NOTE:** This package is based on and forked from **node-red-contrib-modbus version 5.40.0**. It has been heavily customized and optimized to seamlessly integrate with Haiwell PLC addressing (such as X, Y, M, T, C, S components for Bits, and V, TV, CV, SV for Words) without requiring manual offset calculations.

## Features

- **Haiwell Read Bit**: Read X, Y, M, T, C, SM, S bit components directly by name and address.
- **Haiwell Read Word**: Read V, TV, CV, SV word components directly by name and address.
- **Modbus Write**: Write components to the PLC seamlessly.
- Includes all standard features from the original `node-red-contrib-modbus` such as Modbus TCP and Serial, flex nodes, and queueing.

## Installation

Install directly from your Node-RED directory:

    npm install @ismaillowkey/node-red-contrib-haiwell

## Usage

After installation, the new nodes will appear in your Node-RED palette under the Modbus section:
- **Haiwell Read Bit**: Select your component (X, Y, M, T, C, SM, S) and enter the address. The node automatically calculates the correct Modbus offset and reads the bits.
- **Haiwell Read Word**: Select your component (V, TV, CV, SV) and enter the address. The node automatically calculates the correct Modbus offset and returns the value based on your selected data type.

## Authors
Created/Modified by **ismaillowkey**.
Based on the original architecture by Bianco Royal / Klaus Landsdorf.
