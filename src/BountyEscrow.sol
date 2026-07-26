// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Antarmuka minimal Factory yang dibaca escrow untuk tahu alamat oracle aktif.
interface IBountyFactory {
    function oracle() external view returns (address);
}

/// @title BountyEscrow (versi oracle) - escrow satu bounty untuk Papan Sayembara
/// @notice Sesi 4: approve manual funder diganti verdict oracle (fulfillVerification).
///         Escrow baca oracle aktif lewat cross-contract call factory.oracle().
///         Reward dikunci saat fund(), dilepas hanya lewat verdict oracle atau cancel funder.
contract BountyEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status {
        Dibuka, // dibuat, reward belum masuk
        Didanai, // reward terkunci, menunggu karya
        Disubmit, // ada karya menunggu verdict oracle
        Disetujui, // oracle setuju, reward dibayar (final)
        Dibatalkan // dibatalkan funder, reward dikembalikan (final)
    }

    IBountyFactory public immutable factory;
    IERC20 public immutable rewardToken;
    address public immutable funder;
    uint256 public immutable reward;
    uint256 public immutable deadline;
    string public metadataURI;

    address public worker;
    string public karyaURI;
    Status public status;

    event BountyDibuat(address indexed funder, uint256 reward, uint256 deadline);
    event BountyDidanai(uint256 jumlah);
    event KaryaDisubmit(address indexed worker, string karyaURI);
    event VerdictDitulis(address indexed oracle, bool disetujui);
    event BountyDisetujui(address indexed worker, uint256 reward);
    event KaryaDitolak(address indexed worker);
    event BountyDibatalkan(uint256 refund);

    error BukanFunder(address caller);
    error BukanOracle(address caller);
    error StatusSalah(Status sekarang);
    error FactoryNol();
    error FunderNol();
    error TokenNol();
    error RewardNol();
    error DeadlineTakValid();
    error DeadlineLewat();
    error FunderTakBolehSubmit();
    error KaryaKosong();

    modifier hanyaFunder() {
        if (msg.sender != funder) revert BukanFunder(msg.sender);
        _;
    }

    /// @dev Oracle aktif dibaca dari factory (sumber tunggal), bukan disimpan lokal.
    modifier hanyaOracle() {
        if (msg.sender != factory.oracle()) revert BukanOracle(msg.sender);
        _;
    }

    constructor(
        IBountyFactory _factory,
        address _funder,
        IERC20 _rewardToken,
        uint256 _reward,
        string memory _metadataURI,
        uint256 _deadline
    ) {
        if (address(_factory) == address(0)) revert FactoryNol();
        if (_funder == address(0)) revert FunderNol();
        if (address(_rewardToken) == address(0)) revert TokenNol();
        if (_reward == 0) revert RewardNol();
        if (_deadline <= block.timestamp) revert DeadlineTakValid();
        factory = _factory;
        funder = _funder;
        rewardToken = _rewardToken;
        reward = _reward;
        metadataURI = _metadataURI;
        deadline = _deadline;
        status = Status.Dibuka;
        emit BountyDibuat(_funder, _reward, _deadline);
    }

    /// @notice Funder mendanai bounty. Wajib approve reward ke kontrak ini lebih dulu.
    function fund() external hanyaFunder {
        if (status != Status.Dibuka) revert StatusSalah(status);
        status = Status.Didanai;
        rewardToken.safeTransferFrom(funder, address(this), reward);
        emit BountyDidanai(reward);
    }

    /// @notice Worker mengirim karya sebelum deadline. Funder tidak boleh submit sendiri.
    function submitWork(string calldata _karyaURI) external {
        if (status != Status.Didanai) revert StatusSalah(status);
        if (block.timestamp > deadline) revert DeadlineLewat();
        if (msg.sender == funder) revert FunderTakBolehSubmit();
        if (bytes(_karyaURI).length == 0) revert KaryaKosong();
        worker = msg.sender;
        karyaURI = _karyaURI;
        status = Status.Disubmit;
        emit KaryaDisubmit(msg.sender, _karyaURI);
    }

    /// @notice Oracle menulis verdict. disetujui=true bayar worker; false tolak (worker boleh submit ulang).
    function fulfillVerification(bool disetujui) external hanyaOracle nonReentrant {
        if (status != Status.Disubmit) revert StatusSalah(status);
        emit VerdictDitulis(msg.sender, disetujui);
        if (disetujui) {
            status = Status.Disetujui;
            address penerima = worker;
            rewardToken.safeTransfer(penerima, reward);
            emit BountyDisetujui(penerima, reward);
        } else {
            address ditolak = worker;
            worker = address(0);
            karyaURI = "";
            status = Status.Didanai;
            emit KaryaDitolak(ditolak);
        }
    }

    /// @notice Funder membatalkan bounty selama belum disetujui. Reward dikembalikan bila sudah didanai.
    function cancel() external hanyaFunder nonReentrant {
        Status s = status;
        if (s != Status.Dibuka && s != Status.Didanai && s != Status.Disubmit) {
            revert StatusSalah(s);
        }
        status = Status.Dibatalkan;
        uint256 refund;
        if (s != Status.Dibuka) {
            refund = reward;
            rewardToken.safeTransfer(funder, refund);
        }
        emit BountyDibatalkan(refund);
    }
}
