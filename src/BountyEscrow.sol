// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title BountyEscrow - escrow satu bounty untuk Papan Sayembara
/// @notice Alur: buat -> danai -> submit karya -> setujui (bayar) / tolak (ulang) / batal (refund).
///         Reward dikunci di kontrak saat fund(), dilepas hanya lewat approve() atau cancel().
contract BountyEscrow {
    using SafeERC20 for IERC20;

    enum Status {
        Dibuka, // dibuat, reward belum masuk
        Didanai, // reward terkunci di escrow, menunggu karya
        Disubmit, // ada karya menunggu keputusan funder
        Disetujui, // karya diterima, reward dibayar (final)
        Dibatalkan // dibatalkan funder, reward dikembalikan (final)
    }

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
    event KaryaDitolak(address indexed worker);
    event BountyDisetujui(address indexed worker, uint256 reward);
    event BountyDibatalkan(uint256 refund);

    error BukanFunder(address caller);
    error StatusSalah(Status sekarang);
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

    constructor(IERC20 _rewardToken, uint256 _reward, string memory _metadataURI, uint256 _deadline) {
        if (address(_rewardToken) == address(0)) revert TokenNol();
        if (_reward == 0) revert RewardNol();
        if (_deadline <= block.timestamp) revert DeadlineTakValid();
        rewardToken = _rewardToken;
        reward = _reward;
        metadataURI = _metadataURI;
        deadline = _deadline;
        funder = msg.sender;
        status = Status.Dibuka;
        emit BountyDibuat(msg.sender, _reward, _deadline);
    }

    /// @notice Funder mendanai bounty. Wajib approve reward ke kontrak ini lebih dulu.
    function fund() external hanyaFunder {
        if (status != Status.Dibuka) revert StatusSalah(status);
        status = Status.Didanai;
        rewardToken.safeTransferFrom(funder, address(this), reward);
        emit BountyDidanai(reward);
    }

    /// @notice Worker mengirim karya sebelum deadline. Funder tidak boleh submit sendiri.
    function submit(string calldata _karyaURI) external {
        if (status != Status.Didanai) revert StatusSalah(status);
        if (block.timestamp > deadline) revert DeadlineLewat();
        if (msg.sender == funder) revert FunderTakBolehSubmit();
        if (bytes(_karyaURI).length == 0) revert KaryaKosong();
        worker = msg.sender;
        karyaURI = _karyaURI;
        status = Status.Disubmit;
        emit KaryaDisubmit(msg.sender, _karyaURI);
    }

    /// @notice Funder menyetujui karya. Reward dibayar ke worker, bounty final.
    function approve() external hanyaFunder {
        if (status != Status.Disubmit) revert StatusSalah(status);
        status = Status.Disetujui;
        address penerima = worker;
        rewardToken.safeTransfer(penerima, reward);
        emit BountyDisetujui(penerima, reward);
    }

    /// @notice Funder menolak karya. Kembali ke Didanai, worker boleh submit ulang.
    function reject() external hanyaFunder {
        if (status != Status.Disubmit) revert StatusSalah(status);
        address ditolak = worker;
        worker = address(0);
        karyaURI = "";
        status = Status.Didanai;
        emit KaryaDitolak(ditolak);
    }

    /// @notice Funder membatalkan bounty selama belum disetujui. Reward dikembalikan bila sudah didanai.
    function cancel() external hanyaFunder {
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
