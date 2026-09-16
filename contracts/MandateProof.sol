// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MandateProof {
    address public immutable principal;
    bytes32 public immutable mandateDigest;
    uint48 public immutable expiresAt;
    mapping(bytes4 => bool) public allowedSelectors;

    event MandateExecuted(bytes4 indexed selector, bytes32 indexed digest, address indexed caller);

    constructor(address principal_, bytes32 digest_, uint48 expiresAt_, bytes4[] memory selectors) {
        require(principal_ != address(0), "principal is zero");
        require(digest_ != bytes32(0), "digest is zero");
        require(expiresAt_ > block.timestamp, "expiry is past");
        require(selectors.length > 0, "selectors empty");
        principal = principal_;
        mandateDigest = digest_;
        expiresAt = expiresAt_;
        for (uint256 i; i < selectors.length; ++i) {
            require(selectors[i] != bytes4(0), "selector is zero");
            allowedSelectors[selectors[i]] = true;
        }
    }

    function prove(bytes4 selector) external {
        require(block.timestamp <= expiresAt, "mandate expired");
        require(allowedSelectors[selector], "selector not allowed");
        emit MandateExecuted(selector, mandateDigest, msg.sender);
    }
}
