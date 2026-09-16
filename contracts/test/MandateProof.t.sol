// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MandateProof} from "../MandateProof.sol";

contract MandateProofTest {
    function testConstructorAndAllowedSelector() public {
        bytes4 selector = bytes4(keccak256("rebalance()"));
        MandateProof proof = new MandateProof(address(this), bytes32(uint256(1)), uint48(block.timestamp + 1 days), _one(selector));
        require(proof.principal() == address(this));
        require(proof.allowedSelectors(selector));
        proof.prove(selector);
    }

    function testRejectsUndeclaredSelector() public {
        bytes4 allowed = bytes4(keccak256("rebalance()"));
        MandateProof proof = new MandateProof(address(this), bytes32(uint256(1)), uint48(block.timestamp + 1 days), _one(allowed));
        (bool ok,) = address(proof).call(abi.encodeCall(proof.prove, (bytes4(keccak256("withdrawAll()")))));
        require(!ok);
    }

    function _one(bytes4 selector) internal pure returns (bytes4[] memory values) {
        values = new bytes4[](1);
        values[0] = selector;
    }
}
