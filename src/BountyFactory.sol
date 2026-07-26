// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {BountyEscrow, IBountyFactory} from "./BountyEscrow.sol";

/// @title BountyFactory - nyetak satu BountyEscrow per bounty + pegang alamat oracle aktif
/// @notice Sesi 4: factory pattern (kontrak nyetak kontrak) + sumber tunggal oracle.
///         Semua escrow baca oracle lewat factory.oracle(), jadi ganti oracle cukup di satu titik.
contract BountyFactory is Ownable {
    /// @notice Alamat oracle aktif (mis. wallet AI agent). Dibaca semua escrow via factory.oracle().
    address public oracle;

    /// @notice Registry semua escrow yang pernah dibuat factory ini.
    BountyEscrow[] public bounties;

    event OracleDiubah(address indexed oracleLama, address indexed oracleBaru);
    event BountyDibuat(
        address indexed escrow, address indexed funder, uint256 reward, uint256 deadline
    );

    error OracleNol();

    constructor(address initialOwner) Ownable(initialOwner) {}

    /// @notice Set/ganti alamat oracle. Hanya owner. Berlaku serentak untuk semua escrow.
    function setOracle(address _oracle) external onlyOwner {
        if (_oracle == address(0)) revert OracleNol();
        emit OracleDiubah(oracle, _oracle);
        oracle = _oracle;
    }

    /// @notice Buat bounty baru. Pemanggil jadi funder escrow (bukan factory).
    function createBounty(
        IERC20 rewardToken,
        uint256 reward,
        string calldata metadataURI,
        uint256 deadline
    ) external returns (BountyEscrow escrow) {
        escrow = new BountyEscrow(
            IBountyFactory(address(this)), msg.sender, rewardToken, reward, metadataURI, deadline
        );
        bounties.push(escrow);
        emit BountyDibuat(address(escrow), msg.sender, reward, deadline);
    }

    /// @notice Jumlah bounty yang sudah dibuat.
    function jumlahBounty() external view returns (uint256) {
        return bounties.length;
    }

    /// @notice Seluruh alamat escrow dalam registry.
    function semuaBounty() external view returns (BountyEscrow[] memory) {
        return bounties;
    }
}
