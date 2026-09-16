// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MandateProof} from "../contracts/MandateProof.sol";

contract DeployMandateProof {
    function deploy(address principal, bytes32 digest, uint256 expiry, bytes4 selector) external returns (MandateProof deployed) {
        deployed = new MandateProof(principal, digest, uint48(expiry), _one(selector));
    }

    function _one(bytes4 selector) internal pure returns (bytes4[] memory values) {
        values = new bytes4[](1);
        values[0] = selector;
    }
}
