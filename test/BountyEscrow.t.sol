// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {RewardToken} from "../src/RewardToken.sol";
import {BountyEscrow} from "../src/BountyEscrow.sol";

contract BountyEscrowTest is Test {
    RewardToken token;
    BountyEscrow escrow;

    address funder = makeAddr("funder");
    address worker = makeAddr("worker");
    address worker2 = makeAddr("worker2");
    address orang = makeAddr("orang"); // pihak lain, bukan funder/worker

    uint256 constant REWARD = 100 ether;
    uint256 deadline;
    string constant META = "ipfs://rules";
    string constant KARYA = "ipfs://karya";

    // event disalin dari kontrak untuk vm.expectEmit
    event BountyDidanai(uint256 jumlah);
    event KaryaDisubmit(address indexed worker, string karyaURI);
    event KaryaDitolak(address indexed worker);
    event BountyDisetujui(address indexed worker, uint256 reward);
    event BountyDibatalkan(uint256 refund);

    function setUp() public {
        deadline = block.timestamp + 7 days;
        // owner token = funder, jadi funder punya 1000 RWD untuk mendanai bounty
        token = new RewardToken(1000 ether, funder);
        vm.prank(funder);
        escrow = new BountyEscrow(IERC20(address(token)), REWARD, META, deadline);
    }

    // ---- helper ----

    function _danai() internal {
        vm.startPrank(funder);
        token.approve(address(escrow), REWARD);
        escrow.fund();
        vm.stopPrank();
    }

    function _submit(address who) internal {
        vm.prank(who);
        escrow.submit(KARYA);
    }

    // ================= constructor / state awal =================

    function test_InitialState() public view {
        assertEq(address(escrow.rewardToken()), address(token));
        assertEq(escrow.funder(), funder);
        assertEq(escrow.reward(), REWARD);
        assertEq(escrow.deadline(), deadline);
        assertEq(escrow.metadataURI(), META);
        assertEq(escrow.worker(), address(0));
        assertEq(uint256(escrow.status()), uint256(BountyEscrow.Status.Dibuka));
    }

    function test_ConstructorRevertsTokenNol() public {
        vm.prank(funder);
        vm.expectRevert(BountyEscrow.TokenNol.selector);
        new BountyEscrow(IERC20(address(0)), REWARD, META, deadline);
    }

    function test_ConstructorRevertsRewardNol() public {
        vm.prank(funder);
        vm.expectRevert(BountyEscrow.RewardNol.selector);
        new BountyEscrow(IERC20(address(token)), 0, META, deadline);
    }

    function test_ConstructorRevertsDeadlineTakValid() public {
        vm.prank(funder);
        vm.expectRevert(BountyEscrow.DeadlineTakValid.selector);
        new BountyEscrow(IERC20(address(token)), REWARD, META, block.timestamp);
    }

    // ================= fund =================

    function test_FundLocksReward() public {
        vm.startPrank(funder);
        token.approve(address(escrow), REWARD);
        vm.expectEmit(false, false, false, true);
        emit BountyDidanai(REWARD);
        escrow.fund();
        vm.stopPrank();

        assertEq(token.balanceOf(address(escrow)), REWARD);
        assertEq(token.balanceOf(funder), 1000 ether - REWARD);
        assertEq(uint256(escrow.status()), uint256(BountyEscrow.Status.Didanai));
    }

    function test_FundOnlyFunder() public {
        vm.prank(orang);
        vm.expectRevert(abi.encodeWithSelector(BountyEscrow.BukanFunder.selector, orang));
        escrow.fund();
    }

    function test_FundRevertsIfNotDibuka() public {
        _danai();
        vm.prank(funder);
        vm.expectRevert(abi.encodeWithSelector(BountyEscrow.StatusSalah.selector, BountyEscrow.Status.Didanai));
        escrow.fund();
    }

    function test_FundRevertsWithoutApprove() public {
        vm.prank(funder);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, address(escrow), 0, REWARD)
        );
        escrow.fund();
    }

    // ================= submit =================

    function test_SubmitRecordsWorker() public {
        _danai();
        vm.expectEmit(true, false, false, true);
        emit KaryaDisubmit(worker, KARYA);
        _submit(worker);

        assertEq(escrow.worker(), worker);
        assertEq(escrow.karyaURI(), KARYA);
        assertEq(uint256(escrow.status()), uint256(BountyEscrow.Status.Disubmit));
    }

    function test_SubmitRevertsIfNotDidanai() public {
        vm.prank(worker);
        vm.expectRevert(abi.encodeWithSelector(BountyEscrow.StatusSalah.selector, BountyEscrow.Status.Dibuka));
        escrow.submit(KARYA);
    }

    function test_SubmitRevertsAfterDeadline() public {
        _danai();
        vm.warp(deadline + 1);
        vm.prank(worker);
        vm.expectRevert(BountyEscrow.DeadlineLewat.selector);
        escrow.submit(KARYA);
    }

    function test_SubmitRevertsFunderCannot() public {
        _danai();
        vm.prank(funder);
        vm.expectRevert(BountyEscrow.FunderTakBolehSubmit.selector);
        escrow.submit(KARYA);
    }

    function test_SubmitRevertsEmptyKarya() public {
        _danai();
        vm.prank(worker);
        vm.expectRevert(BountyEscrow.KaryaKosong.selector);
        escrow.submit("");
    }

    // ================= approve =================

    function test_ApprovePaysWorker() public {
        _danai();
        _submit(worker);
        vm.expectEmit(true, false, false, true);
        emit BountyDisetujui(worker, REWARD);
        vm.prank(funder);
        escrow.approve();

        assertEq(token.balanceOf(worker), REWARD);
        assertEq(token.balanceOf(address(escrow)), 0);
        assertEq(uint256(escrow.status()), uint256(BountyEscrow.Status.Disetujui));
    }

    function test_ApproveOnlyFunder() public {
        _danai();
        _submit(worker);
        vm.prank(orang);
        vm.expectRevert(abi.encodeWithSelector(BountyEscrow.BukanFunder.selector, orang));
        escrow.approve();
    }

    function test_ApproveRevertsIfNotDisubmit() public {
        _danai();
        vm.prank(funder);
        vm.expectRevert(abi.encodeWithSelector(BountyEscrow.StatusSalah.selector, BountyEscrow.Status.Didanai));
        escrow.approve();
    }

    // ================= reject =================

    function test_RejectResetsToDidanai() public {
        _danai();
        _submit(worker);
        vm.expectEmit(true, false, false, false);
        emit KaryaDitolak(worker);
        vm.prank(funder);
        escrow.reject();

        assertEq(escrow.worker(), address(0));
        assertEq(escrow.karyaURI(), "");
        assertEq(uint256(escrow.status()), uint256(BountyEscrow.Status.Didanai));
        assertEq(token.balanceOf(address(escrow)), REWARD); // reward tetap terkunci
    }

    function test_RejectOnlyFunder() public {
        _danai();
        _submit(worker);
        vm.prank(orang);
        vm.expectRevert(abi.encodeWithSelector(BountyEscrow.BukanFunder.selector, orang));
        escrow.reject();
    }

    function test_RejectRevertsIfNotDisubmit() public {
        _danai();
        vm.prank(funder);
        vm.expectRevert(abi.encodeWithSelector(BountyEscrow.StatusSalah.selector, BountyEscrow.Status.Didanai));
        escrow.reject();
    }

    // ================= cancel =================

    function test_CancelBeforeFundNoRefund() public {
        vm.expectEmit(false, false, false, true);
        emit BountyDibatalkan(0);
        vm.prank(funder);
        escrow.cancel();

        assertEq(uint256(escrow.status()), uint256(BountyEscrow.Status.Dibatalkan));
        assertEq(token.balanceOf(funder), 1000 ether); // tidak ada dana bergerak
    }

    function test_CancelAfterFundRefunds() public {
        _danai();
        vm.expectEmit(false, false, false, true);
        emit BountyDibatalkan(REWARD);
        vm.prank(funder);
        escrow.cancel();

        assertEq(uint256(escrow.status()), uint256(BountyEscrow.Status.Dibatalkan));
        assertEq(token.balanceOf(funder), 1000 ether);
        assertEq(token.balanceOf(address(escrow)), 0);
    }

    function test_CancelAfterSubmitRefunds() public {
        _danai();
        _submit(worker);
        vm.prank(funder);
        escrow.cancel();

        assertEq(uint256(escrow.status()), uint256(BountyEscrow.Status.Dibatalkan));
        assertEq(token.balanceOf(funder), 1000 ether);
        assertEq(token.balanceOf(worker), 0);
    }

    function test_CancelOnlyFunder() public {
        vm.prank(orang);
        vm.expectRevert(abi.encodeWithSelector(BountyEscrow.BukanFunder.selector, orang));
        escrow.cancel();
    }

    function test_CancelRevertsIfFinal() public {
        _danai();
        _submit(worker);
        vm.prank(funder);
        escrow.approve();
        vm.prank(funder);
        vm.expectRevert(abi.encodeWithSelector(BountyEscrow.StatusSalah.selector, BountyEscrow.Status.Disetujui));
        escrow.cancel();
    }

    // ================= alur penuh & fuzz =================

    function test_ResubmitAfterRejectThenApprove() public {
        _danai();
        _submit(worker); // karya pertama
        vm.prank(funder);
        escrow.reject(); // ditolak, balik ke Didanai
        _submit(worker2); // worker lain submit ulang
        vm.prank(funder);
        escrow.approve();

        assertEq(token.balanceOf(worker2), REWARD);
        assertEq(token.balanceOf(worker), 0);
        assertEq(uint256(escrow.status()), uint256(BountyEscrow.Status.Disetujui));
    }

    function testFuzz_AnyWorkerCanBePaid(address w) public {
        vm.assume(w != funder && w != address(0) && w != address(escrow) && w != address(token));
        _danai();
        vm.prank(w);
        escrow.submit(KARYA);
        vm.prank(funder);
        escrow.approve();
        assertEq(token.balanceOf(w), REWARD);
    }
}
